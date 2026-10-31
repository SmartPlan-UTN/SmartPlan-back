import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import request from 'supertest';
import { DataSource, IsNull } from 'typeorm';
import { Activity } from '../src/activities/entities/activity.entity';
import { AuditLog } from '../src/administration/entities/audit-log.entity';
import { Notification } from '../src/administration/entities/notification.entity';
import { UserSession } from '../src/auth/entities/user-session.entity';
import { AttemptLimiterService } from '../src/auth/security/attempt-limiter.service';
import { seedInitialData } from '../src/database/seeds/seed';
import { PlanDetail } from '../src/plans/entities/plan-detail.entity';
import {
  Plan,
  PlanKind,
  PlanVisibility,
} from '../src/plans/entities/plan.entity';
import { Feedback } from '../src/recommendation/entities/feedback.entity';
import { PlanRequest } from '../src/recommendation/entities/plan-request.entity';
import { User } from '../src/users/entities/user.entity';
import { createTestApp } from './create-test-app';

interface OutingBody {
  id: number;
  title: string;
  status: 'to_do' | 'completed';
  feedbackState: string;
  activityNames: string[];
  source: { id: number; available: boolean } | null;
  details: Array<{ order: number; activity: { id: number } }>;
}

interface CreationBody {
  created: boolean;
  outing: OutingBody;
}

describe('Outings API (e2e, CU22, CU23, #98)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let first: Activity;
  let second: Activity;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await seedInitialData(dataSource);
  });

  afterAll(async () => {
    await clearData();
    await app.close();
  });

  beforeEach(async () => {
    app.get(AttemptLimiterService).clear();
    await clearData();
    const activities = dataSource.getRepository(Activity);
    first = await activities.save({
      name: 'Bodega boutique',
      description: 'Degustación de vinos.',
      estimatedCost: 100,
      estimatedDuration: 60,
      type: 'test',
    });
    second = await activities.save({
      name: 'Almuerzo de campo',
      description: 'Comida regional.',
      estimatedCost: 50,
      estimatedDuration: 90,
      type: 'test',
    });
  });

  async function clearData(): Promise<void> {
    if (!dataSource) return;
    await dataSource.getRepository(Notification).deleteAll();
    await dataSource.getRepository(Feedback).deleteAll();
    await dataSource.getRepository(AuditLog).deleteAll();
    await dataSource.getRepository(PlanDetail).deleteAll();
    // Outings point at their source plan; drop them first.
    await dataSource.getRepository(Plan).delete({ kind: PlanKind.Outing });
    await dataSource.getRepository(Plan).deleteAll();
    await dataSource.getRepository(PlanRequest).deleteAll();
    await dataSource.getRepository(UserSession).deleteAll();
    await dataSource.getRepository(User).deleteAll();
    await dataSource.getRepository(Activity).deleteAll();
  }

  async function register(name: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/users')
      .send({
        name: 'Outing',
        lastName: 'Tester',
        email: `${name}@smartplan.test`,
        password: 'Secure-passphrase-for-smartplan1!',
      })
      .expect(201);
    return `Bearer ${(response.body as { accessToken: string }).accessToken}`;
  }

  function as(auth: string) {
    const server = app.getHttpServer();
    return {
      get: (url: string) => request(server).get(url).set('Authorization', auth),
      post: (url: string) =>
        request(server).post(url).set('Authorization', auth),
      patch: (url: string) =>
        request(server).patch(url).set('Authorization', auth),
      delete: (url: string) =>
        request(server).delete(url).set('Authorization', auth),
    };
  }

  /** An authored plan with both activities, published unless told not to. */
  async function authoredPlan(
    auth: string,
    visibility = PlanVisibility.Public,
  ): Promise<number> {
    const created = await as(auth)
      .post('/api/users/me/plans')
      .send({ title: 'Día de viñedos', peopleCount: 2 })
      .expect(201);
    const id = (created.body as { id: number }).id;
    for (const activity of [first, second]) {
      await as(auth)
        .post(`/api/users/me/plans/${id}/details`)
        .send({ activityId: activity.id })
        .expect(201);
    }
    if (visibility === PlanVisibility.Public) {
      await as(auth)
        .patch(`/api/users/me/plans/${id}/visibility`)
        .send({ visibility: 'public' })
        .expect(200);
    }
    return id;
  }

  async function choose(auth: string, sourcePlanId: number, status = 201) {
    const response = await as(auth)
      .post('/api/users/me/outings')
      .send({ sourcePlanId })
      .expect(status);
    return response.body as CreationBody;
  }

  it('copies a published plan into a to-do outing of the chooser', async () => {
    const author = await register('author-copy');
    const chooser = await register('chooser-copy');
    const planId = await authoredPlan(author);

    const { created, outing } = await choose(chooser, planId);

    expect(created).toBe(true);
    expect(outing).toMatchObject({
      title: 'Día de viñedos',
      status: 'to_do',
      feedbackState: 'not_available',
      activityNames: ['Bodega boutique', 'Almuerzo de campo'],
      source: { id: planId, available: true },
    });
    expect(outing.details.map((detail) => detail.activity.id)).toEqual([
      first.id,
      second.id,
    ]);

    const detail = await as(chooser).get(`/api/plans/${planId}`).expect(200);
    expect(detail.body).toMatchObject({
      viewerPlanState: 'selected',
      activeOutingId: outing.id,
    });

    // The outing is a personal copy, not a plan the chooser authored.
    const ownPlans = await as(chooser).get('/api/users/me/plans').expect(200);
    expect((ownPlans.body as { data: unknown[] }).data).toEqual([]);
  });

  it('keeps a single outing under a double click or concurrent requests', async () => {
    const author = await register('author-idempotent');
    const chooser = await register('chooser-idempotent');
    const planId = await authoredPlan(author);

    const responses = await Promise.all([
      as(chooser).post('/api/users/me/outings').send({ sourcePlanId: planId }),
      as(chooser).post('/api/users/me/outings').send({ sourcePlanId: planId }),
      as(chooser).post('/api/users/me/outings').send({ sourcePlanId: planId }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 200, 201,
    ]);
    const ids = new Set(
      responses.map((response) => (response.body as CreationBody).outing.id),
    );
    expect(ids.size).toBe(1);
    expect(
      await dataSource
        .getRepository(Plan)
        .count({ where: { kind: PlanKind.Outing } }),
    ).toBe(1);
  });

  it('freezes the outing: editing the original changes only later choices', async () => {
    const author = await register('author-snapshot');
    const early = await register('early-snapshot');
    const late = await register('late-snapshot');
    const planId = await authoredPlan(author);

    const before = (await choose(early, planId)).outing;

    await as(author)
      .patch(`/api/users/me/plans/${planId}`)
      .send({ title: 'Día de viñedos (renovado)' })
      .expect(200);
    const ownDetail = await as(author)
      .get(`/api/users/me/plans/${planId}`)
      .expect(200);
    const firstDetailId = (ownDetail.body as { details: Array<{ id: number }> })
      .details[0].id;
    await as(author)
      .delete(`/api/users/me/plans/${planId}/details/${firstDetailId}`)
      .expect(204);

    const frozen = await as(early)
      .get(`/api/users/me/outings/${before.id}`)
      .expect(200);
    expect(frozen.body).toMatchObject({
      title: 'Día de viñedos',
      activityNames: ['Bodega boutique', 'Almuerzo de campo'],
    });

    const after = (await choose(late, planId)).outing;
    expect(after).toMatchObject({
      title: 'Día de viñedos (renovado)',
      activityNames: ['Almuerzo de campo'],
    });
  });

  it('lets two people manage their outings of the same plan independently', async () => {
    const author = await register('author-independent');
    const one = await register('one-independent');
    const other = await register('other-independent');
    const planId = await authoredPlan(author);
    const oneOuting = (await choose(one, planId)).outing;
    const otherOuting = (await choose(other, planId)).outing;

    await as(one)
      .patch(`/api/users/me/outings/${oneOuting.id}/complete`)
      .expect(200);

    const others = await as(other)
      .get(`/api/users/me/outings/${otherOuting.id}`)
      .expect(200);
    expect((others.body as OutingBody).status).toBe('to_do');
    await as(other).get(`/api/users/me/outings/${oneOuting.id}`).expect(404);

    const original = await dataSource
      .getRepository(Plan)
      .findOneOrFail({ where: { id: planId }, relations: { status: true } });
    expect(original.status.key).toBe('confirmed');
    expect(original.completedAt).toBeNull();
  });

  it('opens feedback only once the outing is marked done, and at once', async () => {
    const author = await register('author-feedback');
    const chooser = await register('chooser-feedback');
    const outing = (await choose(chooser, await authoredPlan(author))).outing;

    const early = await as(chooser)
      .post(`/api/plans/${outing.id}/feedback`)
      .send({ rating: 5 })
      .expect(409);
    expect(early.body).toMatchObject({ code: 'FEEDBACK_NOT_YET_AVAILABLE' });

    const completed = await as(chooser)
      .patch(`/api/users/me/outings/${outing.id}/complete`)
      .expect(200);
    expect(completed.body).toMatchObject({
      status: 'completed',
      feedbackState: 'available',
    });

    await as(chooser)
      .post(`/api/plans/${outing.id}/feedback`)
      .send({ rating: 4, tags: ['would_recommend'] })
      .expect(201);
    const submitted = await as(chooser)
      .get(`/api/users/me/outings/${outing.id}`)
      .expect(200);
    expect(submitted.body).toMatchObject({
      feedbackState: 'submitted',
      feedback: { rating: 4 },
    });
  });

  it('refuses feedback on a plan that is not an outing', async () => {
    const author = await register('author-no-feedback');
    const planId = await authoredPlan(author);

    const response = await as(author)
      .post(`/api/plans/${planId}/feedback`)
      .send({ rating: 5 })
      .expect(409);
    expect(response.body).toMatchObject({ code: 'FEEDBACK_REQUIRES_OUTING' });
  });

  it('repeats a done plan as a new outing, keeping the old one and its feedback', async () => {
    const author = await register('author-repeat');
    const chooser = await register('chooser-repeat');
    const planId = await authoredPlan(author);
    const done = (await choose(chooser, planId)).outing;
    await as(chooser)
      .patch(`/api/users/me/outings/${done.id}/complete`)
      .expect(200);
    await as(chooser)
      .post(`/api/plans/${done.id}/feedback`)
      .send({ rating: 3 })
      .expect(201);

    const repeated = await as(chooser)
      .post(`/api/users/me/outings/${done.id}/repeat`)
      .expect(201);
    const again = (repeated.body as CreationBody).outing;
    expect(again.id).not.toBe(done.id);
    expect(again).toMatchObject({
      status: 'to_do',
      source: { id: planId },
    });

    const toDo = await as(chooser)
      .get('/api/users/me/outings')
      .query({ status: 'to_do' })
      .expect(200);
    expect(toDo.body).toMatchObject({
      data: [{ id: again.id }],
      pagination: { total: 1 },
    });
    const completed = await as(chooser)
      .get('/api/users/me/outings')
      .query({ status: 'completed' })
      .expect(200);
    expect(completed.body).toMatchObject({
      data: [{ id: done.id, feedback: { rating: 3 } }],
      pagination: { total: 1 },
    });

    // Choosing the source again while the repeat is to do returns it.
    const same = await choose(chooser, planId, 200);
    expect(same.outing.id).toBe(again.id);
  });

  it('repeats from the frozen copy once the original is no longer available', async () => {
    const author = await register('author-repeat-private');
    const chooser = await register('chooser-repeat-private');
    const planId = await authoredPlan(author);
    const done = (await choose(chooser, planId)).outing;
    await as(chooser)
      .patch(`/api/users/me/outings/${done.id}/complete`)
      .expect(200);
    await as(author)
      .patch(`/api/users/me/plans/${planId}/visibility`)
      .send({ visibility: 'private' })
      .expect(200);

    const listed = await as(chooser)
      .get(`/api/users/me/outings/${done.id}`)
      .expect(200);
    expect(listed.body).toMatchObject({
      source: { id: planId, available: false },
    });

    const repeated = await as(chooser)
      .post(`/api/users/me/outings/${done.id}/repeat`)
      .expect(201);
    expect((repeated.body as CreationBody).outing).toMatchObject({
      status: 'to_do',
      activityNames: ['Bodega boutique', 'Almuerzo de campo'],
    });
  });

  it('cancels an outing to do, but never a completed one', async () => {
    const author = await register('author-cancel');
    const chooser = await register('chooser-cancel');
    const planId = await authoredPlan(author);
    const outing = (await choose(chooser, planId)).outing;

    await as(chooser).delete(`/api/users/me/outings/${outing.id}`).expect(204);
    await as(chooser).get(`/api/users/me/outings/${outing.id}`).expect(404);
    const detail = await as(chooser).get(`/api/plans/${planId}`).expect(200);
    expect(detail.body).toMatchObject({
      viewerPlanState: 'selectable',
      activeOutingId: null,
    });

    const done = (await choose(chooser, planId)).outing;
    await as(chooser)
      .patch(`/api/users/me/outings/${done.id}/complete`)
      .expect(200);
    const refused = await as(chooser)
      .delete(`/api/users/me/outings/${done.id}`)
      .expect(409);
    expect(refused.body).toMatchObject({ code: 'OUTING_ALREADY_COMPLETED' });
  });

  it("cannot choose another person's private plan, even knowing its id", async () => {
    const author = await register('author-private');
    const stranger = await register('stranger-private');
    const planId = await authoredPlan(author, PlanVisibility.Private);

    const response = await as(stranger)
      .post('/api/users/me/outings')
      .send({ sourcePlanId: planId })
      .expect(404);
    expect(response.body).toMatchObject({ code: 'PLAN_NOT_FOUND' });
    expect(
      await dataSource
        .getRepository(Plan)
        .count({ where: { kind: PlanKind.Outing } }),
    ).toBe(0);
  });

  it('lets the author choose their own private plan', async () => {
    const author = await register('author-own');
    const planId = await authoredPlan(author, PlanVisibility.Private);

    const { outing } = await choose(author, planId);

    expect(outing.source).toMatchObject({ id: planId, available: true });
  });

  it('never takes an outing as a source', async () => {
    const author = await register('author-outing-source');
    const chooser = await register('chooser-outing-source');
    const outing = (await choose(chooser, await authoredPlan(author))).outing;

    const response = await as(chooser)
      .post('/api/users/me/outings')
      .send({ sourcePlanId: outing.id })
      .expect(409);
    expect(response.body).toMatchObject({ code: 'PLAN_NOT_ACTIONABLE' });
  });

  it('keeps only the chosen generated result in the personal cycle', async () => {
    const requester = await register('requester-generated');
    const requesterId = (
      await dataSource.getRepository(User).findOneOrFail({
        where: { email: 'requester-generated@smartplan.test' },
      })
    ).id;
    const generatedStatus = await dataSource
      .createQueryBuilder()
      .select('status.id', 'id')
      .from('plan_status', 'status')
      .where('status.key = :key', { key: 'generated' })
      .getRawOne<{ id: number }>();
    const [chosen] = await dataSource.getRepository(Plan).save(
      ['Alternativa A', 'Alternativa B'].map((title) => ({
        idUser: requesterId,
        kind: PlanKind.Generated,
        idPlanStatus: generatedStatus!.id,
        title,
        description: null,
        estimatedTotalCost: 0,
        estimatedTotalDuration: 0,
      })),
    );

    await choose(requester, chosen.id);

    const ownPlans = await as(requester).get('/api/users/me/plans').expect(200);
    expect((ownPlans.body as { data: unknown[] }).data).toEqual([]);
    const outings = await as(requester)
      .get('/api/users/me/outings')
      .expect(200);
    expect(outings.body).toMatchObject({
      data: [{ title: 'Alternativa A', source: { id: chosen.id } }],
      pagination: { total: 1 },
    });

    // Another person cannot reach the requester's result.
    const stranger = await register('stranger-generated');
    await as(stranger)
      .post('/api/users/me/outings')
      .send({ sourcePlanId: chosen.id })
      .expect(404);
  });

  it('allows a new outing of the same plan once the previous one is done', async () => {
    const author = await register('author-slot');
    const chooser = await register('chooser-slot');
    const planId = await authoredPlan(author);
    const outing = (await choose(chooser, planId)).outing;
    await as(chooser)
      .patch(`/api/users/me/outings/${outing.id}/complete`)
      .expect(200);

    const next = (await choose(chooser, planId)).outing;
    expect(next.id).not.toBe(outing.id);
    expect(
      await dataSource.getRepository(Plan).count({
        where: { kind: PlanKind.Outing, completedAt: IsNull() },
      }),
    ).toBe(1);
  });

  it('filters "Mis salidas" by text, local date range, feedback and sort (#134)', async () => {
    const author = await register('author-filters');
    const chooser = await register('chooser-filters');
    const plans = dataSource.getRepository(Plan);

    // Three outings with their own title, cost and completion day.
    const outings: number[] = [];
    for (const [title, cost, completedAt] of [
      ['Tarde de vinos', 300, '2026-09-20T15:00:00Z'],
      ['Museos 100% gratis', 0, '2026-08-10T15:00:00Z'],
      // 01:00 UTC on Sep 1 is still Aug 31 in Mendoza.
      ['Picnic', 120, '2026-09-01T01:00:00Z'],
    ] as const) {
      const outing = (await choose(chooser, await authoredPlan(author))).outing;
      await as(chooser)
        .patch(`/api/users/me/outings/${outing.id}/complete`)
        .expect(200);
      await plans.update(outing.id, {
        title,
        estimatedTotalCost: cost,
        completedAt: new Date(completedAt),
      });
      outings.push(outing.id);
    }
    await as(chooser)
      .post(`/api/plans/${outings[0]}/feedback`)
      .send({ rating: 5 })
      .expect(201);

    async function titles(query: string): Promise<string[]> {
      const response = await as(chooser)
        .get(`/api/users/me/outings?status=completed&${query}`)
        .expect(200);
      return (response.body as { data: OutingBody[] }).data.map(
        (outing) => outing.title,
      );
    }

    expect(await titles('')).toEqual([
      'Tarde de vinos',
      'Picnic',
      'Museos 100% gratis',
    ]);
    // Title, activity names, and LIKE wildcards taken literally.
    expect(await titles('search=vinos')).toEqual(['Tarde de vinos']);
    expect(await titles('search=almuerzo')).toHaveLength(3);
    expect(await titles('search=100%25')).toEqual(['Museos 100% gratis']);
    expect(await titles('search=_')).toEqual([]);
    // Inclusive calendar days in Argentina.
    expect(await titles('from=2026-09-01')).toEqual(['Tarde de vinos']);
    expect(await titles('from=2026-08-31&to=2026-08-31')).toEqual(['Picnic']);
    expect(await titles('rated=true')).toEqual(['Tarde de vinos']);
    expect(await titles('rated=false')).toEqual([
      'Picnic',
      'Museos 100% gratis',
    ]);
    expect(await titles('sort=oldest')).toEqual([
      'Museos 100% gratis',
      'Picnic',
      'Tarde de vinos',
    ]);
    expect(await titles('sort=cost_asc')).toEqual([
      'Museos 100% gratis',
      'Picnic',
      'Tarde de vinos',
    ]);

    const paged = await as(chooser)
      .get(
        '/api/users/me/outings?status=completed&sort=cost_desc&limit=2&page=2',
      )
      .expect(200);
    expect(paged.body).toMatchObject({
      data: [{ title: 'Museos 100% gratis' }],
      pagination: { page: 2, total: 3, totalPages: 2 },
    });

    await as(chooser).get('/api/users/me/outings?from=2026-13-01').expect(400);
    await as(chooser).get('/api/users/me/outings?sort=random').expect(400);
  });
});
