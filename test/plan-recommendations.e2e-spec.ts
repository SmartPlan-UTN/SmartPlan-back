import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { seedInitialData } from '../src/database/seeds/seed';
import { Plan } from '../src/plans/entities/plan.entity';
import { PlanRecommendationDto } from '../src/plans/dto/plan-recommendation.dto';
import { UserSession } from '../src/auth/entities/user-session.entity';
import { User } from '../src/users/entities/user.entity';
import { createTestApp } from './create-test-app';

describe('Plan recommendations API (e2e, CU20/CU21)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let accessToken: string;
  let userId: number;
  let otherUserId: number;

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
        password: 'secure-passphrase-for-smartplan',
      });
    accessToken = (registration.body as { accessToken: string }).accessToken;
    userId = (registration.body as { user: { id: number } }).user.id;

    const otherRegistration = await request(app.getHttpServer())
      .post('/api/users')
      .send({
        name: 'Other',
        lastName: 'Person',
        email: 'other-person@example.com',
        password: 'secure-passphrase-for-smartplan',
      });
    otherUserId = (otherRegistration.body as { user: { id: number } }).user.id;
  });

  afterAll(async () => {
    await dataSource.getRepository(Plan).deleteAll();
    await dataSource.getRepository(UserSession).deleteAll();
    await dataSource.getRepository(User).deleteAll();
    await app.close();
  });

  afterEach(async () => {
    await dataSource.getRepository(Plan).deleteAll();
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

  async function createPlan(options: {
    idUser: number;
    statusKey: string;
    title: string;
  }): Promise<Plan> {
    const plans = dataSource.getRepository(Plan);
    return plans.save(
      plans.create({
        idUser: options.idUser,
        idPlanStatus: await planStatusId(options.statusKey),
        title: options.title,
        description: 'desc',
        estimatedTotalCost: 1000,
        estimatedTotalDuration: 60,
      }),
    );
  }

  it('returns the caller own generated plans as "own" with canSelect true', async () => {
    const own = await createPlan({
      idUser: userId,
      statusKey: 'generated',
      title: 'My generated plan',
    });

    const response = await request(app.getHttpServer())
      .get('/api/plan-recommendations')
      .set(...authorization())
      .expect(200);

    const body = response.body as { data: PlanRecommendationDto[] };
    const match = body.data.find((item) => item.plan.id === own.id);
    expect(match).toMatchObject({ kind: 'own', canSelect: true });
  });

  it('returns other users completed plans as "popular" with canSelect false', async () => {
    const popular = await createPlan({
      idUser: otherUserId,
      statusKey: 'completed',
      title: 'A popular plan from someone else',
    });

    const response = await request(app.getHttpServer())
      .get('/api/plan-recommendations')
      .set(...authorization())
      .expect(200);

    const body = response.body as { data: PlanRecommendationDto[] };
    const match = body.data.find((item) => item.plan.id === popular.id);
    expect(match).toMatchObject({ kind: 'popular', canSelect: false });
  });

  it('never returns another user generated (not yet completed) plan as popular', async () => {
    const notYetCompleted = await createPlan({
      idUser: otherUserId,
      statusKey: 'generated',
      title: 'Not visible to others yet',
    });

    const response = await request(app.getHttpServer())
      .get('/api/plan-recommendations')
      .set(...authorization())
      .expect(200);

    const body = response.body as { data: PlanRecommendationDto[] };
    expect(body.data.some((item) => item.plan.id === notYetCompleted.id)).toBe(
      false,
    );
  });

  it('rejects selecting a popular plan obtained from the recommendations feed (server-side ownership)', async () => {
    const popular = await createPlan({
      idUser: otherUserId,
      statusKey: 'completed',
      title: 'Not selectable by another user',
    });

    await request(app.getHttpServer())
      .patch(`/api/plans/${popular.id}/select`)
      .set(...authorization())
      .expect(403);
  });

  it('rejects without authentication', async () => {
    await request(app.getHttpServer())
      .get('/api/plan-recommendations')
      .expect(401);
  });
});
