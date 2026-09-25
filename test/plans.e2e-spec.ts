import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import request from 'supertest';
import type { Response, Test } from 'supertest';
import { DataSource } from 'typeorm';
import { AuditLog } from '../src/administration/entities/audit-log.entity';
import { Activity } from '../src/activities/entities/activity.entity';
import { PasswordRecovery } from '../src/auth/entities/password-recovery.entity';
import { UserSession } from '../src/auth/entities/user-session.entity';
import { AttemptLimiterService } from '../src/auth/security/attempt-limiter.service';
import { seedInitialData } from '../src/database/seeds/seed';
import { PlanDetail } from '../src/plans/entities/plan-detail.entity';
import { Plan } from '../src/plans/entities/plan.entity';
import { UserPreference } from '../src/users/entities/user-preference.entity';
import { User } from '../src/users/entities/user.entity';
import { createTestApp } from './create-test-app';

describe('Plan management API (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let activity: Activity;

  const registrationData = {
    name: 'Plan',
    lastName: 'Owner',
    email: 'plan-owner@smartplan.test',
    password: 'secure-passphrase-for-smartplan',
  };

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
    activity = await dataSource.getRepository(Activity).save({
      name: 'Plan activity',
      description: 'An activity used to test plan management.',
      estimatedCost: 125.5,
      estimatedDuration: 90,
      type: 'test',
    });
  });

  function register(data = registrationData): Test {
    return request(app.getHttpServer()).post('/api/users').send(data);
  }

  function authorization(response: Response): string {
    const body = response.body as { accessToken?: unknown };
    if (typeof body.accessToken !== 'string') {
      throw new Error('The response did not include accessToken');
    }
    return `Bearer ${body.accessToken}`;
  }

  async function createPlan(authorizationHeader: string): Promise<number> {
    const response = await request(app.getHttpServer())
      .post('/api/users/me/plans')
      .set('Authorization', authorizationHeader)
      .send({
        title: 'Saturday plan',
        description: 'A manually built plan',
        peopleCount: 2,
      })
      .expect(201);
    return (response.body as { id: number }).id;
  }

  it('creates, manages, calculates, and cancels an own plan (CU24-CU30)', async () => {
    const registration = await register().expect(201);
    const auth = authorization(registration);
    const planId = await createPlan(auth);

    const listed = await request(app.getHttpServer())
      .get('/api/users/me/plans')
      .set('Authorization', auth)
      .expect(200);
    expect(listed.body).toMatchObject({
      data: [
        {
          id: planId,
          title: 'Saturday plan',
          peopleCount: 2,
          estimatedTotalCost: 0,
          estimatedCostPerPerson: 0,
          activityCount: 0,
          status: { key: 'confirmed' },
        },
      ],
      pagination: { total: 1 },
    });

    const added = await request(app.getHttpServer())
      .post(`/api/users/me/plans/${planId}/details`)
      .set('Authorization', auth)
      .send({ activityId: activity.id })
      .expect(201);
    expect(added.body).toMatchObject({
      estimatedTotalCost: 125.5,
      estimatedCostPerPerson: 62.75,
      estimatedTotalDuration: 90,
      details: [
        {
          order: 1,
          estimatedCost: 125.5,
          estimatedDuration: 90,
          activity: { id: activity.id, name: activity.name },
        },
      ],
    });
    const detailId = (added.body as { details: Array<{ id: number }> })
      .details[0].id;

    const updated = await request(app.getHttpServer())
      .patch(`/api/users/me/plans/${planId}`)
      .set('Authorization', auth)
      .send({ title: 'Updated Saturday plan', peopleCount: 5 })
      .expect(200);
    expect(updated.body).toMatchObject({
      title: 'Updated Saturday plan',
      peopleCount: 5,
      estimatedCostPerPerson: 25.1,
    });

    const detail = await request(app.getHttpServer())
      .get(`/api/users/me/plans/${planId}`)
      .set('Authorization', auth)
      .expect(200);
    expect(detail.body).toMatchObject({
      id: planId,
      details: [{ id: detailId }],
    });

    await request(app.getHttpServer())
      .delete(`/api/users/me/plans/${planId}/details/${detailId}`)
      .set('Authorization', auth)
      .expect(204);
    const withoutDetails = await request(app.getHttpServer())
      .get(`/api/users/me/plans/${planId}`)
      .set('Authorization', auth)
      .expect(200);
    expect(withoutDetails.body).toMatchObject({
      estimatedTotalCost: 0,
      estimatedCostPerPerson: 0,
      estimatedTotalDuration: 0,
      details: [],
    });

    await request(app.getHttpServer())
      .delete(`/api/users/me/plans/${planId}`)
      .set('Authorization', auth)
      .expect(204);
    const cancelled = await request(app.getHttpServer())
      .get(`/api/users/me/plans/${planId}`)
      .set('Authorization', auth)
      .expect(200);
    expect(cancelled.body).toMatchObject({ status: { key: 'cancelled' } });
  });

  it('uses activity snapshots, prevents duplicates, and enforces ownership (CU27-CU28)', async () => {
    const owner = await register().expect(201);
    const planId = await createPlan(authorization(owner));
    await request(app.getHttpServer())
      .post(`/api/users/me/plans/${planId}/details`)
      .set('Authorization', authorization(owner))
      .send({ activityId: activity.id })
      .expect(201);
    await dataSource.getRepository(Activity).update(activity.id, {
      estimatedCost: 999,
      estimatedDuration: 999,
    });
    const snapshot = await request(app.getHttpServer())
      .get(`/api/users/me/plans/${planId}`)
      .set('Authorization', authorization(owner))
      .expect(200);
    expect(snapshot.body).toMatchObject({
      details: [{ estimatedCost: 125.5, estimatedDuration: 90 }],
    });

    const duplicate = await request(app.getHttpServer())
      .post(`/api/users/me/plans/${planId}/details`)
      .set('Authorization', authorization(owner))
      .send({ activityId: activity.id })
      .expect(409);
    expect(duplicate.body).toMatchObject({ code: 'ACTIVITY_ALREADY_IN_PLAN' });

    const other = await register({
      ...registrationData,
      email: 'another-plan-owner@smartplan.test',
    }).expect(201);
    const inaccessible = await request(app.getHttpServer())
      .get(`/api/users/me/plans/${planId}`)
      .set('Authorization', authorization(other))
      .expect(404);
    expect(inaccessible.body).toMatchObject({ code: 'PLAN_NOT_FOUND' });
  });

  it('rejects invalid plan payloads and unavailable suggested generation (CU24-CU31)', async () => {
    const registration = await register().expect(201);
    const auth = authorization(registration);
    await request(app.getHttpServer())
      .post('/api/users/me/plans')
      .set('Authorization', auth)
      .send({ title: '', peopleCount: 0, unknown: true })
      .expect(400);
    const planId = await createPlan(auth);
    const missingActivity = await request(app.getHttpServer())
      .post(`/api/users/me/plans/${planId}/details`)
      .set('Authorization', auth)
      .send({ activityId: 999999 })
      .expect(404);
    expect(missingActivity.body).toMatchObject({ code: 'ACTIVITY_NOT_FOUND' });

    const suggestion = await request(app.getHttpServer())
      .post('/api/plan-suggestions')
      .set('Authorization', auth)
      .send({
        budget: 1000,
        latitude: -32.8895,
        longitude: -68.8458,
        peopleCount: 2,
        availableDurationMinutes: 120,
        preferences: ['Gastronomy'],
      })
      .expect(501);
    expect(suggestion.body).toMatchObject({
      code: 'PLAN_GENERATION_NOT_AVAILABLE',
    });
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
