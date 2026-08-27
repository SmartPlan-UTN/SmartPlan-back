import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { seedInitialData } from '../src/database/seeds/seed';
import { Activity } from '../src/activities/entities/activity.entity';
import { Plan, PlanVisibility } from '../src/plans/entities/plan.entity';
import { PlanDetail } from '../src/plans/entities/plan-detail.entity';
import { PlanRecommendationDto } from '../src/plans/dto/plan-recommendation.dto';
import {
  PlanRequest,
  PlanRequestMode,
} from '../src/recommendation/entities/plan-request.entity';
import { Role } from '../src/users/entities/role.entity';
import { UserSession } from '../src/auth/entities/user-session.entity';
import { User } from '../src/users/entities/user.entity';
import { createTestApp } from './create-test-app';

interface RecommendationsBody {
  data: PlanRecommendationDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  meta: { personalized: boolean; locationUsed: boolean };
}

describe('Plan recommendations API (e2e, CU20/US19)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let accessToken: string;
  let userId: number;
  let otherUserId: number;

  const password = 'secure-passphrase-for-smartplan';

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await seedInitialData(dataSource);

    const registration = await request(app.getHttpServer())
      .post('/api/users')
      .send({
        name: 'Recommendee',
        lastName: 'Uno',
        email: 'recommendee@example.com',
        password,
      });
    accessToken = (registration.body as { accessToken: string }).accessToken;
    userId = (registration.body as { user: { id: number } }).user.id;

    const otherRegistration = await request(app.getHttpServer())
      .post('/api/users')
      .send({
        name: 'Other',
        lastName: 'Person',
        email: 'other-person@example.com',
        password,
      });
    otherUserId = (otherRegistration.body as { user: { id: number } }).user.id;
  });

  afterAll(async () => {
    await dataSource.getRepository(PlanDetail).deleteAll();
    await dataSource.getRepository(Plan).deleteAll();
    await dataSource.getRepository(Activity).deleteAll();
    await dataSource.getRepository(PlanRequest).deleteAll();
    await dataSource.getRepository(UserSession).deleteAll();
    await dataSource.getRepository(User).deleteAll();
    await app.close();
  });

  afterEach(async () => {
    await dataSource.getRepository(PlanDetail).deleteAll();
    await dataSource.getRepository(Plan).deleteAll();
    await dataSource.getRepository(Activity).deleteAll();
    await dataSource.getRepository(PlanRequest).deleteAll();
  });

  function authorization(): [string, string] {
    return ['Authorization', `Bearer ${accessToken}`];
  }

  async function planStatusId(key: string): Promise<number> {
    const status = await dataSource
      .createQueryBuilder()
      .select('status.id', 'id')
      .from('plan_status', 'status')
      .where('status.key = :key', { key })
      .getRawOne<{ id: number }>();
    if (!status) throw new Error(`Missing plan_status seed value "${key}"`);
    return status.id;
  }

  async function requestStatusId(key: string): Promise<number> {
    const status = await dataSource
      .createQueryBuilder()
      .select('status.id', 'id')
      .from('request_status', 'status')
      .where('status.key = :key', { key })
      .getRawOne<{ id: number }>();
    if (!status) throw new Error(`Missing request_status seed value "${key}"`);
    return status.id;
  }

  async function createPlan(options: {
    idUser: number;
    statusKey: string;
    title: string;
    visibility?: PlanVisibility;
    generated?: boolean;
  }): Promise<Plan> {
    const plans = dataSource.getRepository(Plan);
    let idPlanRequest: number | null = null;
    if (options.generated) {
      const saved = await dataSource.getRepository(PlanRequest).save(
        dataSource.getRepository(PlanRequest).create({
          idUser: options.idUser,
          mode: PlanRequestMode.Automatic,
          requestedAt: new Date(),
          idRequestStatus: await requestStatusId('generated'),
        }),
      );
      idPlanRequest = saved.id;
    }
    const plan = await plans.save(
      plans.create({
        idUser: options.idUser,
        idPlanRequest,
        idPlanStatus: await planStatusId(options.statusKey),
        title: options.title,
        description: 'desc',
        estimatedTotalCost: 1000,
        estimatedTotalDuration: 60,
        visibility: options.visibility ?? PlanVisibility.Private,
      }),
    );

    // A recommendable plan must have at least one activity in its itinerary.
    const activities = dataSource.getRepository(Activity);
    const activity = await activities.save(
      activities.create({
        name: `Activity for ${options.title}`,
        description: 'desc',
        estimatedCost: 500,
        estimatedDuration: 60,
        type: null,
      }),
    );
    const details = dataSource.getRepository(PlanDetail);
    await details.save(
      details.create({
        idPlan: plan.id,
        idActivity: activity.id,
        order: 1,
        estimatedCost: 500,
        estimatedDuration: 60,
        note: null,
      }),
    );

    return plan;
  }

  async function adminToken(): Promise<string> {
    const email = 'recommendations-admin@example.com';
    await request(app.getHttpServer())
      .post('/api/users')
      .send({ name: 'Admin', lastName: 'User', email, password });
    const role = await dataSource
      .getRepository(Role)
      .findOneByOrFail({ key: 'admin' });
    await dataSource.getRepository(User).update({ email }, { idRole: role.id });
    const login = await request(app.getHttpServer())
      .post('/api/sessions')
      .send({ email, password });
    return (login.body as { accessToken: string }).accessToken;
  }

  it('rejects without authentication', async () => {
    await request(app.getHttpServer())
      .get('/api/plan-recommendations')
      .expect(401);
  });

  it('rejects an out-of-range limit', async () => {
    await request(app.getHttpServer())
      .get('/api/plan-recommendations?limit=101')
      .set(...authorization())
      .expect(400);
  });

  it('rejects an unknown query parameter', async () => {
    await request(app.getHttpServer())
      .get('/api/plan-recommendations?mystery=1')
      .set(...authorization())
      .expect(400);
  });

  it('rejects an out-of-range latitude', async () => {
    await request(app.getHttpServer())
      .get('/api/plan-recommendations?latitude=200&longitude=0')
      .set(...authorization())
      .expect(400);
  });

  it('returns the documented shape with meta and a null imageUrl', async () => {
    await createPlan({
      idUser: otherUserId,
      statusKey: 'completed',
      title: 'Public plan',
      visibility: PlanVisibility.Public,
    });

    const response = await request(app.getHttpServer())
      .get('/api/plan-recommendations?limit=9')
      .set(...authorization())
      .expect(200);

    const body = response.body as RecommendationsBody;
    expect(body.meta).toEqual({ personalized: false, locationUsed: false });
    expect(body.pagination).toMatchObject({ page: 1, limit: 9 });
    const item = body.data.find((entry) => entry.plan.title === 'Public plan');
    expect(item).toBeDefined();
    expect(item?.canSelect).toBe(false);
    expect(item?.reason).toBe('popular');
    expect(item?.plan.imageUrl).toBeNull();
  });

  it('reports locationUsed when coordinates are supplied', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/plan-recommendations?latitude=-32.89&longitude=-68.84')
      .set(...authorization())
      .expect(200);

    expect((response.body as RecommendationsBody).meta.locationUsed).toBe(true);
  });

  it('never recommends a private plan of another user', async () => {
    const hidden = await createPlan({
      idUser: otherUserId,
      statusKey: 'completed',
      title: 'Private plan',
      visibility: PlanVisibility.Private,
    });

    const response = await request(app.getHttpServer())
      .get('/api/plan-recommendations')
      .set(...authorization())
      .expect(200);

    const body = response.body as RecommendationsBody;
    expect(body.data.some((entry) => entry.plan.id === hidden.id)).toBe(false);
  });

  it('never recommends the caller own plans', async () => {
    const own = await createPlan({
      idUser: userId,
      statusKey: 'completed',
      title: 'My own plan',
      visibility: PlanVisibility.Public,
    });

    const response = await request(app.getHttpServer())
      .get('/api/plan-recommendations')
      .set(...authorization())
      .expect(200);

    const body = response.body as RecommendationsBody;
    expect(body.data.some((entry) => entry.plan.id === own.id)).toBe(false);
  });

  it('returns an empty page past the end without an error', async () => {
    await createPlan({
      idUser: otherUserId,
      statusKey: 'completed',
      title: 'Only plan',
      visibility: PlanVisibility.Public,
    });

    const response = await request(app.getHttpServer())
      .get('/api/plan-recommendations?page=5')
      .set(...authorization())
      .expect(200);

    const body = response.body as RecommendationsBody;
    expect(body.data).toEqual([]);
    expect(body.pagination.total).toBe(1);
  });

  it('publishes an AI-generated plan to the pool when an admin completes it', async () => {
    const generated = await createPlan({
      idUser: otherUserId,
      statusKey: 'generated',
      title: 'Generated then completed',
      generated: true,
    });

    await request(app.getHttpServer())
      .patch(`/api/admin/plans/${generated.id}`)
      .set('Authorization', `Bearer ${await adminToken()}`)
      .send({ status: 'completed' })
      .expect(200);

    const stored = await dataSource
      .getRepository(Plan)
      .findOneByOrFail({ id: generated.id });
    expect(stored.visibility).toBe(PlanVisibility.Public);
    expect(stored.completedAt).not.toBeNull();

    const response = await request(app.getHttpServer())
      .get('/api/plan-recommendations')
      .set(...authorization())
      .expect(200);

    const body = response.body as RecommendationsBody;
    expect(body.data.some((entry) => entry.plan.id === generated.id)).toBe(
      true,
    );
  });

  it('keeps a manually created plan private when an admin completes it', async () => {
    const manual = await createPlan({
      idUser: otherUserId,
      statusKey: 'confirmed',
      title: 'Manual then completed',
    });

    await request(app.getHttpServer())
      .patch(`/api/admin/plans/${manual.id}`)
      .set('Authorization', `Bearer ${await adminToken()}`)
      .send({ status: 'completed' })
      .expect(200);

    const stored = await dataSource
      .getRepository(Plan)
      .findOneByOrFail({ id: manual.id });
    expect(stored.visibility).toBe(PlanVisibility.Private);

    const response = await request(app.getHttpServer())
      .get('/api/plan-recommendations')
      .set(...authorization())
      .expect(200);

    const body = response.body as RecommendationsBody;
    expect(body.data.some((entry) => entry.plan.id === manual.id)).toBe(false);
  });
});
