import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { seedInitialData } from '../src/database/seeds/seed';
import { Feedback } from '../src/recommendation/entities/feedback.entity';
import { Plan } from '../src/plans/entities/plan.entity';
import { UserSession } from '../src/auth/entities/user-session.entity';
import { User } from '../src/users/entities/user.entity';
import { createTestApp } from './create-test-app';

describe('Plan feedback API (e2e, CU23)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let accessToken: string;
  let otherAccessToken: string;
  let userId: number;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await seedInitialData(dataSource);

    const registration = await request(app.getHttpServer())
      .post('/api/users')
      .send({
        name: 'Feedback',
        lastName: 'Uno',
        email: 'feedback-user@example.com',
        password: 'secure-passphrase-for-smartplan',
      });
    accessToken = (registration.body as { accessToken: string }).accessToken;
    userId = (registration.body as { user: { id: number } }).user.id;

    const otherRegistration = await request(app.getHttpServer())
      .post('/api/users')
      .send({
        name: 'Feedback',
        lastName: 'Dos',
        email: 'other-feedback-user@example.com',
        password: 'secure-passphrase-for-smartplan',
      });
    otherAccessToken = (otherRegistration.body as { accessToken: string })
      .accessToken;
  });

  afterAll(async () => {
    await dataSource.getRepository(Feedback).deleteAll();
    await dataSource.getRepository(Plan).deleteAll();
    await dataSource.getRepository(UserSession).deleteAll();
    await dataSource.getRepository(User).deleteAll();
    await app.close();
  });

  afterEach(async () => {
    await dataSource.getRepository(Feedback).deleteAll();
    await dataSource.getRepository(Plan).deleteAll();
  });

  function authorization(token: string): [string, string] {
    return ['Authorization', `Bearer ${token}`];
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

  async function createPlan(statusKey: string): Promise<Plan> {
    const plans = dataSource.getRepository(Plan);
    return plans.save(
      plans.create({
        idUser: userId,
        idPlanStatus: await planStatusId(statusKey),
        title: 'Feedback test plan',
        description: 'desc',
        estimatedTotalCost: 1000,
        estimatedTotalDuration: 60,
      }),
    );
  }

  it('submits feedback for a completed plan as pending', async () => {
    const plan = await createPlan('completed');

    const response = await request(app.getHttpServer())
      .post(`/api/plans/${plan.id}/feedback`)
      .set(...authorization(accessToken))
      .send({ rating: 5, tags: ['great_value'], comment: 'Loved it' })
      .expect(201);

    expect(response.body).toMatchObject({ rating: 5, idPlan: plan.id });

    const stored = await dataSource.getRepository(Feedback).findOneOrFail({
      where: { idPlan: plan.id },
      relations: { status: true },
    });
    expect(stored.status.key).toBe('pending');
  });

  it('rejects feedback for a plan that is not completed yet', async () => {
    const plan = await createPlan('generated');

    const response = await request(app.getHttpServer())
      .post(`/api/plans/${plan.id}/feedback`)
      .set(...authorization(accessToken))
      .send({ rating: 5 })
      .expect(409);

    expect(response.body).toMatchObject({
      code: 'FEEDBACK_NOT_YET_AVAILABLE',
    });
  });

  it('rejects feedback submitted by a user who does not own the plan', async () => {
    const plan = await createPlan('completed');

    await request(app.getHttpServer())
      .post(`/api/plans/${plan.id}/feedback`)
      .set(...authorization(otherAccessToken))
      .send({ rating: 5 })
      .expect(403);
  });

  it('rejects a second submission for the same plan', async () => {
    const plan = await createPlan('completed');

    await request(app.getHttpServer())
      .post(`/api/plans/${plan.id}/feedback`)
      .set(...authorization(accessToken))
      .send({ rating: 5 })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post(`/api/plans/${plan.id}/feedback`)
      .set(...authorization(accessToken))
      .send({ rating: 3 })
      .expect(409);

    expect(response.body).toMatchObject({
      code: 'FEEDBACK_ALREADY_SUBMITTED',
    });
  });

  it('rejects an invalid rating', async () => {
    const plan = await createPlan('completed');

    await request(app.getHttpServer())
      .post(`/api/plans/${plan.id}/feedback`)
      .set(...authorization(accessToken))
      .send({ rating: 6 })
      .expect(400);
  });

  it('serializes two concurrent submissions to exactly one success and one row', async () => {
    const plan = await createPlan('completed');

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/plans/${plan.id}/feedback`)
        .set(...authorization(accessToken))
        .send({ rating: 4 }),
      request(app.getHttpServer())
        .post(`/api/plans/${plan.id}/feedback`)
        .set(...authorization(accessToken))
        .send({ rating: 2 }),
    ]);

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([201, 409]);

    const count = await dataSource
      .getRepository(Feedback)
      .count({ where: { idPlan: plan.id } });
    expect(count).toBe(1);
  });
});
