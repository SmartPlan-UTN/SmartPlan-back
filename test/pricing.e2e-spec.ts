import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Activity } from '../src/activities/entities/activity.entity';
import { AuditLog } from '../src/administration/entities/audit-log.entity';
import { UserSession } from '../src/auth/entities/user-session.entity';
import { AttemptLimiterService } from '../src/auth/security/attempt-limiter.service';
import { seedInitialData } from '../src/database/seeds/seed';
import { PlanDetail } from '../src/plans/entities/plan-detail.entity';
import { Plan } from '../src/plans/entities/plan.entity';
import { Role } from '../src/users/entities/role.entity';
import { User } from '../src/users/entities/user.entity';
import { createTestAppWithoutRabbit } from './create-test-app';

interface PriceBody {
  kind: string;
  min: number | null;
  max: number | null;
  unit: string | null;
  source: string | null;
  confidence: string;
}

interface PlanBody {
  id: number;
  estimatedTotalCost: number | null;
  estimatedTotalCostMax: number | null;
  estimatedCostPerPerson: number | null;
  unpricedCount: number;
  priceCompleteness: string;
  details: Array<{
    id: number;
    estimatedCost: number | null;
    price: PriceBody;
    activity: { id: number; price: PriceBody };
  }>;
}

describe('Price model: UNKNOWN is never FREE (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminToken: string;
  let userToken: string;

  const password = 'Secure-passphrase-for-smartplan1!';

  beforeAll(async () => {
    app = await createTestAppWithoutRabbit();
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
    adminToken = await registerAndToken('pricing-admin@smartplan.test', true);
    userToken = await registerAndToken('pricing-user@smartplan.test', false);
  });

  const base = {
    description: 'Catalog activity used by the pricing suite.',
    estimatedDuration: 60,
  };

  async function createActivity(
    name: string,
    price?: Record<string, unknown>,
  ): Promise<number> {
    const response = await request(app.getHttpServer())
      .post('/api/admin/activities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name, ...base, categoryIds: [], ...(price ? { price } : {}) })
      .expect(201);
    return (response.body as { id: number }).id;
  }

  async function createPlan(peopleCount: number): Promise<number> {
    const response = await request(app.getHttpServer())
      .post('/api/users/me/plans')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ title: 'Pricing plan', peopleCount })
      .expect(201);
    return (response.body as { id: number }).id;
  }

  async function addToPlan(
    planId: number,
    activityId: number,
  ): Promise<PlanBody> {
    const response = await request(app.getHttpServer())
      .post(`/api/users/me/plans/${planId}/details`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ activityId })
      .expect(201);
    return response.body as PlanBody;
  }

  it('creates an activity without a price as UNKNOWN, with no amount and no zero', async () => {
    const id = await createActivity('No price yet');

    const detail = await request(app.getHttpServer())
      .get(`/api/activities/${id}`)
      .expect(200);
    expect(detail.body).toMatchObject({
      estimatedCost: null,
      price: {
        kind: 'UNKNOWN',
        min: null,
        max: null,
        source: null,
        confidence: 'NONE',
      },
    });
  });

  it('keeps FREE, FROM, RANGE and FIXED distinct and validates their shape', async () => {
    const free = await createActivity('Free park', {
      kind: 'FREE',
      unit: 'PER_PERSON',
      source: 'OFFICIAL',
      sourceRef: 'https://example.test/parque',
    });
    const from = await createActivity('From price', {
      kind: 'FROM',
      min: 8000,
      unit: 'PER_PERSON',
      source: 'CURATED',
    });
    const range = await createActivity('Range price', {
      kind: 'RANGE',
      min: 3000,
      max: 6000,
      unit: 'PER_PERSON',
      source: 'CURATED',
    });

    const get = async (id: number) =>
      (
        await request(app.getHttpServer())
          .get(`/api/activities/${id}`)
          .expect(200)
      ).body as { estimatedCost: number | null; price: PriceBody };

    expect(await get(free)).toMatchObject({
      estimatedCost: 0,
      price: {
        kind: 'FREE',
        min: 0,
        max: 0,
        source: 'OFFICIAL',
        confidence: 'HIGH',
      },
    });
    expect(await get(from)).toMatchObject({
      estimatedCost: 8000,
      price: { kind: 'FROM', min: 8000, max: null },
    });
    expect(await get(range)).toMatchObject({
      estimatedCost: 3000,
      price: { kind: 'RANGE', min: 3000, max: 6000 },
    });

    // FREE needs a source; RANGE needs min < max; a legacy zero is rejected.
    for (const bad of [
      { kind: 'RANGE', min: 5000, max: 5000, unit: 'PER_PERSON' },
      { kind: 'FIXED', min: -5, unit: 'PER_PERSON' },
      { kind: 'FIXED', unit: 'PER_PERSON' },
    ]) {
      await request(app.getHttpServer())
        .post('/api/admin/activities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Bad', ...base, categoryIds: [], price: bad })
        .expect(400);
    }
    await request(app.getHttpServer())
      .post('/api/admin/activities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Legacy zero', ...base, categoryIds: [], estimatedCost: 0 })
      .expect(400);
  });

  it('never lets an UNKNOWN price pass a price filter or sort first', async () => {
    await createActivity('Cheap', {
      kind: 'FIXED',
      min: 1000,
      unit: 'PER_PERSON',
      source: 'CURATED',
    });
    await createActivity('Expensive', {
      kind: 'FIXED',
      min: 9000,
      unit: 'PER_PERSON',
      source: 'CURATED',
    });
    await createActivity('Mystery');

    const filtered = await request(app.getHttpServer())
      .get('/api/activities?maxPrice=5000')
      .expect(200);
    const names = (filtered.body as { data: Array<{ name: string }> }).data.map(
      (activity) => activity.name,
    );
    expect(names).toEqual(['Cheap']);

    for (const direction of ['asc', 'desc']) {
      const sorted = await request(app.getHttpServer())
        .get(`/api/activities?sortBy=price&direction=${direction}`)
        .expect(200);
      const order = (sorted.body as { data: Array<{ name: string }> }).data.map(
        (activity) => activity.name,
      );
      expect(order[order.length - 1]).toBe('Mystery');
    }
  });

  it('counts per-person prices by party size and flags unpriced activities', async () => {
    const wine = await createActivity('Tasting', {
      kind: 'FIXED',
      min: 5000,
      unit: 'PER_PERSON',
      source: 'CURATED',
    });
    const mystery = await createActivity('Mystery stop');
    const planId = await createPlan(4);

    const afterWine = await addToPlan(planId, wine);
    expect(afterWine).toMatchObject({
      estimatedTotalCost: 20000,
      estimatedTotalCostMax: 20000,
      estimatedCostPerPerson: 5000,
      unpricedCount: 0,
      priceCompleteness: 'EXACT',
    });

    const withMystery = await addToPlan(planId, mystery);
    expect(withMystery).toMatchObject({
      estimatedTotalCost: 20000,
      estimatedTotalCostMax: null,
      unpricedCount: 1,
      priceCompleteness: 'PARTIAL',
    });
    const unknownDetail = withMystery.details.find(
      (detail) => detail.activity.id === mystery,
    );
    expect(unknownDetail).toMatchObject({
      estimatedCost: null,
      price: { kind: 'UNKNOWN' },
    });

    // Changing the party size re-prices per-person amounts.
    const resized = await request(app.getHttpServer())
      .patch(`/api/users/me/plans/${planId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ peopleCount: 2 })
      .expect(200);
    expect(resized.body).toMatchObject({
      estimatedTotalCost: 10000,
      estimatedCostPerPerson: 5000,
    });
  });

  it('reports an all-unknown plan as NONE with a null total instead of $0', async () => {
    const mystery = await createActivity('Only mystery');
    const planId = await createPlan(2);
    const plan = await addToPlan(planId, mystery);
    expect(plan).toMatchObject({
      estimatedTotalCost: null,
      estimatedCostPerPerson: null,
      unpricedCount: 1,
      priceCompleteness: 'NONE',
    });
  });

  it('preserves the saved price when the activity price changes later', async () => {
    const id = await createActivity('Repriced', {
      kind: 'FIXED',
      min: 1000,
      unit: 'PER_PERSON',
      source: 'CURATED',
    });
    const planId = await createPlan(2);
    await addToPlan(planId, id);

    await request(app.getHttpServer())
      .patch(`/api/admin/activities/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        price: {
          kind: 'FIXED',
          min: 4000,
          unit: 'PER_PERSON',
          source: 'OFFICIAL',
        },
      })
      .expect(200);

    const plan = (
      await request(app.getHttpServer())
        .get(`/api/users/me/plans/${planId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200)
    ).body as PlanBody;

    expect(plan.estimatedTotalCost).toBe(2000);
    expect(plan.details[0].price).toMatchObject({ kind: 'FIXED', min: 1000 });
    // The activity itself shows the new price; the saved plan does not follow.
    expect(plan.details[0].activity.price).toMatchObject({ min: 4000 });

    // Adding a second stop recomputes from snapshots, not from live prices.
    const other = await createActivity('Other', {
      kind: 'FIXED',
      min: 500,
      unit: 'PER_PERSON',
      source: 'CURATED',
    });
    const updated = await addToPlan(planId, other);
    expect(updated.estimatedTotalCost).toBe(3000);
  });

  it('copies the exact snapshot into an outing', async () => {
    const id = await createActivity('Outing price', {
      kind: 'FROM',
      min: 2500,
      unit: 'PER_PERSON',
      source: 'CURATED',
    });
    const planId = await createPlan(2);
    await addToPlan(planId, id);
    await request(app.getHttpServer())
      .patch(`/api/users/me/plans/${planId}/visibility`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ visibility: 'public' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/admin/activities/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        price: {
          kind: 'FIXED',
          min: 9999,
          unit: 'PER_PERSON',
          source: 'OFFICIAL',
        },
      })
      .expect(200);

    const other = await registerAndToken('outing-user@smartplan.test', false);
    const chosen = await request(app.getHttpServer())
      .post('/api/users/me/outings')
      .set('Authorization', `Bearer ${other}`)
      .send({ sourcePlanId: planId })
      .expect(201);
    const outingId = (chosen.body as { outing: { id: number } }).outing.id;
    const rows = await dataSource.getRepository(PlanDetail).find({
      where: { idPlan: outingId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      priceKind: 'FROM',
      priceMin: 2500,
      priceMax: null,
    });
  });

  async function registerAndToken(
    email: string,
    administrator: boolean,
  ): Promise<string> {
    const registration = await request(app.getHttpServer())
      .post('/api/users')
      .send({ name: 'Test', lastName: 'Account', email, password })
      .expect(201);
    if (!administrator) {
      return (registration.body as { accessToken: string }).accessToken;
    }
    const role = await dataSource
      .getRepository(Role)
      .findOneByOrFail({ key: 'admin' });
    await dataSource.getRepository(User).update({ email }, { idRole: role.id });
    const login = await request(app.getHttpServer())
      .post('/api/sessions')
      .send({ email, password })
      .expect(201);
    return (login.body as { accessToken: string }).accessToken;
  }

  async function clearData(): Promise<void> {
    if (!dataSource) return;
    await dataSource.getRepository(AuditLog).deleteAll();
    await dataSource.getRepository(PlanDetail).deleteAll();
    await dataSource.getRepository(Plan).deleteAll();
    await dataSource.getRepository(UserSession).deleteAll();
    await dataSource.getRepository(User).deleteAll();
    await dataSource.getRepository(Activity).deleteAll();
  }
});
