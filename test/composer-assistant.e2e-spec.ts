import { INestApplication } from '@nestjs/common';
import {
  AmqpConnection,
  AmqpConnectionManager,
} from '@golevelup/nestjs-rabbitmq';
import request from 'supertest';
import type { Response } from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { Activity } from '../src/activities/entities/activity.entity';
import { AuditLog } from '../src/administration/entities/audit-log.entity';
import { PasswordRecovery } from '../src/auth/entities/password-recovery.entity';
import { UserSession } from '../src/auth/entities/user-session.entity';
import { AttemptLimiterService } from '../src/auth/security/attempt-limiter.service';
import { seedInitialData } from '../src/database/seeds/seed';
import { Plan } from '../src/plans/entities/plan.entity';
import { PlanDetail } from '../src/plans/entities/plan-detail.entity';
import {
  GeminiClientService,
  StructuredAskUnavailableError,
} from '../src/recommendation/gemini/gemini-client.service';
import { UserPreference } from '../src/users/entities/user-preference.entity';
import { User } from '../src/users/entities/user.entity';
import { ASSISTANT_MAX_PER_MINUTE } from '../src/plans/composer-assistant/assistant-limiter';
import { createTestApp } from './create-test-app';

describe("Plan composer's assistant (e2e)", () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let auth: string;
  let first: Activity;
  let second: Activity;
  const askStructured = jest.fn();

  const registration = {
    name: 'Assistant',
    lastName: 'Owner',
    email: 'assistant-owner@smartplan.test',
    password: 'Secure-passphrase-for-smartplan1!',
  };

  beforeAll(async () => {
    const connection = { publish: jest.fn() };
    app = await createTestApp((module) =>
      module
        .overrideProvider(AmqpConnectionManager)
        .useValue({
          addConnection: jest.fn(),
          getConnection: jest.fn().mockReturnValue(connection),
          getConnections: jest.fn().mockReturnValue([]),
          clearConnections: jest.fn(),
          close: jest.fn().mockResolvedValue(undefined),
        })
        .overrideProvider(AmqpConnection)
        .useValue(connection)
        .overrideProvider(GeminiClientService)
        .useValue({ askStructured }),
    );
    dataSource = app.get(DataSource);
    await seedInitialData(dataSource);
  });

  afterAll(async () => {
    await clearData();
    await app.close();
  });

  beforeEach(async () => {
    askStructured.mockReset();
    app.get(AttemptLimiterService).clear();
    await clearData();
    const activities = dataSource.getRepository(Activity);
    first = await activities.save({
      name: 'Cheap quiet cafe',
      description: 'A calm place for coffee.',
      estimatedCost: 3000,
      estimatedDuration: 45,
      type: 'gastronomy',
    });
    second = await activities.save({
      name: 'Expensive dinner',
      description: 'A fine dining restaurant.',
      estimatedCost: 30000,
      estimatedDuration: 120,
      type: 'gastronomy',
    });
    const registered = await request(app.getHttpServer())
      .post('/api/users')
      .send(registration)
      .expect(201);
    auth = `Bearer ${(registered.body as { accessToken: string }).accessToken}`;
  });

  const post = (path: string, body: unknown) =>
    request(app.getHttpServer())
      .post(`/api/users/me/plans/assistant/${path}`)
      .set('Authorization', auth)
      .send(body as object);

  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .post('/api/users/me/plans/assistant/search')
      .send({ query: 'algo rico', stopActivityIds: [] })
      .expect(401);
    expect(askStructured).not.toHaveBeenCalled();
  });

  it('validates what it is asked before spending a model call', async () => {
    await post('search', { query: 'x', stopActivityIds: [] }).expect(400);
    await post('search', { query: 'algo rico' }).expect(400);
    await post('search', {
      query: 'algo rico',
      stopActivityIds: [first.id, first.id],
    }).expect(400);
    await post('suggest', { title: '', stopActivityIds: [] }).expect(400);
    await post('improve', {
      title: 'Plan',
      stopActivityIds: [first.id],
    }).expect(400);
    expect(askStructured).not.toHaveBeenCalled();
  });

  it('resolves natural-language search to real activities only, and enforces the price ceiling itself', async () => {
    askStructured.mockResolvedValue({
      results: [
        { id: 987654, reason: 'Invented by the model' },
        { id: second.id, reason: 'Too expensive for the ceiling' },
        { id: first.id, reason: 'Tranquilo y barato' },
      ],
      maxPrice: 5000,
      nearActivityId: null,
      tags: ['Tranquilo'],
    });

    const response = await post('search', {
      query: 'algo para comer, barato y tranquilo',
      stopActivityIds: [],
    }).expect(200);
    const body = response.body as {
      interpretation: { chips: string[] };
      results: Array<{
        activity: { id: number; estimatedCost: number };
        reason: string;
      }>;
    };

    expect(body.results.map((result) => result.activity.id)).toEqual([
      first.id,
    ]);
    // Price and everything else come from the catalog, never from the model.
    expect(body.results[0].activity.estimatedCost).toBe(3000);
    expect(body.interpretation.chips).toEqual(
      expect.arrayContaining(['Tranquilo']),
    );
    const [[call]] = askStructured.mock.calls as Array<[{ prompt: string }]>;
    expect(call.prompt).toContain('algo para comer, barato y tranquilo');
    expect(call.prompt).toContain('Cheap quiet cafe');
  });

  it('suggests only activities that are not already on the route', async () => {
    askStructured.mockResolvedValue({
      suggestions: [
        { id: first.id, reason: 'Already on the route' },
        { id: second.id, reason: 'Para cerrar el día' },
      ],
      gap: { categoryName: null, message: null },
    });
    const response = await post('suggest', {
      title: 'Sábado',
      stopActivityIds: [first.id],
    }).expect(200);
    const body = response.body as {
      suggestions: Array<{ activity: { id: number } }>;
      gap: unknown;
    };
    expect(body.suggestions.map((item) => item.activity.id)).toEqual([
      second.id,
    ]);
    expect(body.gap).toBeNull();
  });

  it('proposes improvements with effects computed by the API, and never changes the plan', async () => {
    askStructured.mockResolvedValue({
      proposals: [
        {
          kind: 'reorder',
          reason: 'La cena va al final',
          orderedActivityIds: [second.id, first.id],
          activityId: null,
          position: null,
        },
        {
          kind: 'remove',
          reason: 'Es redundante',
          orderedActivityIds: [],
          activityId: second.id,
          position: null,
        },
        {
          kind: 'remove',
          reason: 'An id that is not on the route',
          orderedActivityIds: [],
          activityId: 987654,
          position: null,
        },
      ],
    });
    const plansBefore = await dataSource.getRepository(Plan).count();
    const response = await post('improve', {
      title: 'Día largo',
      stopActivityIds: [first.id, second.id],
    }).expect(200);
    const body = response.body as {
      proposals: Array<{
        kind: string;
        effect: { minutes: number; cost: number; km: number | null };
      }>;
    };
    expect(body.proposals.map((proposal) => proposal.kind)).toEqual([
      'reorder',
      'remove',
    ]);
    expect(body.proposals[1].effect).toEqual({
      minutes: -120,
      cost: -30000,
      km: null,
    });
    expect(await dataSource.getRepository(Plan).count()).toBe(plansBefore);
  });

  it('answers 503 ASSISTANT_UNAVAILABLE when the model is slow or down', async () => {
    askStructured.mockRejectedValue(new StructuredAskUnavailableError());
    const response: Response = await post('search', {
      query: 'algo rico',
      stopActivityIds: [],
    }).expect(503);
    expect(response.body).toMatchObject({ code: 'ASSISTANT_UNAVAILABLE' });
  });

  it('answers 429 ASSISTANT_RATE_LIMITED past the per-person budget, without calling the provider', async () => {
    askStructured.mockResolvedValue({
      results: [],
      maxPrice: null,
      nearActivityId: null,
      tags: [],
    });
    const calls = ASSISTANT_MAX_PER_MINUTE;
    for (let index = 0; index < calls; index++) {
      await post('search', {
        query: `algo rico ${index}`,
        stopActivityIds: [],
      }).expect(200);
    }
    const refused: Response = await post('search', {
      query: 'una más',
      stopActivityIds: [],
    }).expect(429);
    expect(refused.body).toMatchObject({ code: 'ASSISTANT_RATE_LIMITED' });
    expect(askStructured).toHaveBeenCalledTimes(calls);
  });

  async function clearData(): Promise<void> {
    if (!dataSource) return;
    await dataSource.getRepository(AuditLog).deleteAll();
    await dataSource.getRepository(PlanDetail).deleteAll();
    await dataSource.getRepository(Plan).deleteAll();
    await dataSource.getRepository(PasswordRecovery).deleteAll();
    await dataSource.getRepository(UserSession).deleteAll();
    await dataSource.getRepository(UserPreference).deleteAll();
    await dataSource.getRepository(User).deleteAll();
    await dataSource.getRepository(Activity).deleteAll();
  }
});
