import { INestApplication } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import request from 'supertest';
import type { Test } from 'supertest';
import { App } from 'supertest/types';
import { Activity } from '../src/activities/entities/activity.entity';
import { AuditLog } from '../src/administration/entities/audit-log.entity';
import { UserSession } from '../src/auth/entities/user-session.entity';
import { seedInitialData } from '../src/database/seeds/seed';
import { FavoriteActivity } from '../src/favorites/entities/favorite-activity.entity';
import { FavoriteList } from '../src/favorites/entities/favorite-list.entity';
import { FavoritePlan } from '../src/favorites/entities/favorite-plan.entity';
import { PlanDetail } from '../src/plans/entities/plan-detail.entity';
import { Plan } from '../src/plans/entities/plan.entity';
import { User } from '../src/users/entities/user.entity';
import { createTestApp } from './create-test-app';

interface RegisteredUser {
  id: number;
  token: string;
}

describe('Favorites API (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let activity: Activity;
  let registrationSequence = 0;
  const userIds: number[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await seedInitialData(dataSource);
    activity = await dataSource.getRepository(Activity).save({
      name: 'Favorites test activity',
      description: 'Activity used by the favorites endpoint tests',
      estimatedCost: 30,
      estimatedDuration: 45,
      type: 'test',
    });
  });

  afterAll(async () => {
    await clearData();
    await dataSource.getRepository(Activity).delete(activity.id);
    await app.close();
  });

  it('saves an activity in favorites and returns it (CU15)', async () => {
    const user = await register('save-activity');

    const response = await authenticated(user.token)
      .post('/api/favorite-activities')
      .send({ idActivity: activity.id })
      .expect(201);

    expect(response.body).toMatchObject({
      idActivity: activity.id,
      activity: {
        id: activity.id,
        name: 'Favorites test activity',
        estimatedCost: 30,
        estimatedDuration: 45,
        type: 'test',
      },
    });
    expect(response.body).toMatchObject({
      id: expect.any(Number) as number,
      savedAt: expect.any(String) as string,
    });
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });

  it('lists only the saved activities of the authenticated user (CU39)', async () => {
    const user = await register('list-activities');
    const other = await register('list-activities-other');
    await save(user.token, 'favorite-activities', { idActivity: activity.id });

    const response = await authenticated(user.token)
      .get('/api/favorite-activities')
      .query({ sortBy: 'name', direction: 'asc', page: 1, limit: 10 })
      .expect(200);

    expect(response.body).toMatchObject({
      data: [
        {
          idActivity: activity.id,
          activity: { name: 'Favorites test activity' },
        },
      ],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    const empty = await authenticated(other.token)
      .get('/api/favorite-activities')
      .expect(200);
    expect(empty.body).toMatchObject({
      data: [],
      pagination: { total: 0, totalPages: 0 },
    });
  });

  it('saves a plan in favorites and returns its summary (CU43)', async () => {
    const user = await register('save-plan');
    const planId = await createPlan(user.token);

    const response = await authenticated(user.token)
      .post('/api/favorite-plans')
      .send({ idPlan: planId })
      .expect(201);

    expect(response.body).toMatchObject({
      idPlan: planId,
      plan: {
        id: planId,
        title: 'Favorites test plan',
        peopleCount: 2,
        activityCount: 0,
        status: { key: 'confirmed' },
      },
    });
  });

  it('lists the saved plans with their activity count (CU40)', async () => {
    const user = await register('list-plans');
    const planId = await createPlan(user.token);
    await authenticated(user.token)
      .post(`/api/users/me/plans/${planId}/details`)
      .send({ activityId: activity.id })
      .expect(201);
    await save(user.token, 'favorite-plans', { idPlan: planId });

    const response = await authenticated(user.token)
      .get('/api/favorite-plans')
      .query({ sortBy: 'title', direction: 'asc' })
      .expect(200);

    expect(response.body).toMatchObject({
      data: [
        {
          idPlan: planId,
          plan: {
            id: planId,
            title: 'Favorites test plan',
            activityCount: 1,
            estimatedTotalCost: 30,
          },
        },
      ],
      pagination: { total: 1 },
    });
  });

  it('removes a saved activity without deleting the activity (CU41)', async () => {
    const user = await register('remove-activity');
    const saved = await save(user.token, 'favorite-activities', {
      idActivity: activity.id,
    });

    await authenticated(user.token)
      .delete(`/api/favorite-activities/${activity.id}`)
      .expect(204);

    const membership = await dataSource
      .getRepository(FavoriteActivity)
      .findOne({ where: { id: saved.id }, withDeleted: true });
    expect(membership?.deletedAt).toBeInstanceOf(Date);
    await request(app.getHttpServer())
      .get(`/api/activities/${activity.id}`)
      .expect(200);
  });

  it('removes a saved plan without deleting the plan (CU42)', async () => {
    const user = await register('remove-plan');
    const planId = await createPlan(user.token);
    const saved = await save(user.token, 'favorite-plans', { idPlan: planId });

    await authenticated(user.token)
      .delete(`/api/favorite-plans/${planId}`)
      .expect(204);

    const membership = await dataSource
      .getRepository(FavoritePlan)
      .findOne({ where: { id: saved.id }, withDeleted: true });
    expect(membership?.deletedAt).toBeInstanceOf(Date);
    await request(app.getHttpServer()).get(`/api/plans/${planId}`).expect(200);
  });

  it('allows saving an activity again after removing it (CU15, CU41)', async () => {
    const user = await register('re-save');
    await save(user.token, 'favorite-activities', { idActivity: activity.id });
    await authenticated(user.token)
      .delete(`/api/favorite-activities/${activity.id}`)
      .expect(204);

    const response = await authenticated(user.token)
      .post('/api/favorite-activities')
      .send({ idActivity: activity.id })
      .expect(201);

    expect(response.body).toMatchObject({ idActivity: activity.id });
  });

  it('requires authentication for every favorites endpoint', async () => {
    await request(app.getHttpServer())
      .get('/api/favorite-activities')
      .expect(401);
    await request(app.getHttpServer()).get('/api/favorite-plans').expect(401);
    await request(app.getHttpServer())
      .post('/api/favorite-activities')
      .send({ idActivity: activity.id })
      .expect(401);
    await request(app.getHttpServer())
      .delete(`/api/favorite-plans/${activity.id}`)
      .expect(401);
  });

  it('rejects duplicates, unknown resources, and invalid payloads', async () => {
    const user = await register('errors');
    await save(user.token, 'favorite-activities', { idActivity: activity.id });

    const duplicate = await authenticated(user.token)
      .post('/api/favorite-activities')
      .send({ idActivity: activity.id })
      .expect(409);
    expect(duplicate.body).toMatchObject({
      code: 'ACTIVITY_ALREADY_IN_FAVORITES',
    });

    const missingActivity = await authenticated(user.token)
      .post('/api/favorite-activities')
      .send({ idActivity: 999999 })
      .expect(404);
    expect(missingActivity.body).toMatchObject({ code: 'ACTIVITY_NOT_FOUND' });

    const missingPlan = await authenticated(user.token)
      .post('/api/favorite-plans')
      .send({ idPlan: 999999 })
      .expect(404);
    expect(missingPlan.body).toMatchObject({ code: 'PLAN_NOT_FOUND' });

    const notSaved = await authenticated(user.token)
      .delete('/api/favorite-plans/999999')
      .expect(404);
    expect(notSaved.body).toMatchObject({ code: 'FAVORITE_PLAN_NOT_FOUND' });

    await authenticated(user.token)
      .post('/api/favorite-activities')
      .send({ idActivity: 0 })
      .expect(400);
    await authenticated(user.token)
      .get('/api/favorite-activities')
      .query({ sortBy: 'estimatedCost; DROP TABLE activity' })
      .expect(400);
  });

  async function register(label: string): Promise<RegisteredUser> {
    registrationSequence += 1;
    const response = await request(app.getHttpServer())
      .post('/api/users')
      .send({
        name: 'Favorite',
        lastName: 'Tester',
        email: `favorites-${Date.now()}-${registrationSequence}-${label}@example.com`,
        password: 'secure-passphrase-for-favorites',
      })
      .expect(201);
    const body = response.body as {
      accessToken: string;
      user: { id: number };
    };
    userIds.push(body.user.id);
    return { id: body.user.id, token: body.accessToken };
  }

  function authenticated(token: string) {
    const authorize = (test: Test): Test =>
      test.set('Authorization', `Bearer ${token}`);
    return {
      get: (url: string) => authorize(request(app.getHttpServer()).get(url)),
      post: (url: string) => authorize(request(app.getHttpServer()).post(url)),
      delete: (url: string) =>
        authorize(request(app.getHttpServer()).delete(url)),
    };
  }

  async function save(
    token: string,
    resource: 'favorite-activities' | 'favorite-plans',
    payload: Record<string, number>,
  ): Promise<{ id: number }> {
    const response = await authenticated(token)
      .post(`/api/${resource}`)
      .send(payload)
      .expect(201);
    return response.body as { id: number };
  }

  async function createPlan(token: string): Promise<number> {
    const response = await authenticated(token)
      .post('/api/users/me/plans')
      .send({
        title: 'Favorites test plan',
        description: 'A plan saved by the favorites endpoint tests',
        peopleCount: 2,
      })
      .expect(201);
    return (response.body as { id: number }).id;
  }

  async function clearData(): Promise<void> {
    if (userIds.length === 0) return;

    const lists = await dataSource
      .getRepository(FavoriteList)
      .find({ where: { idUser: In(userIds) }, withDeleted: true });
    const listIds = lists.map(({ id }) => id);
    if (listIds.length > 0) {
      await dataSource
        .getRepository(FavoriteActivity)
        .delete({ idFavoriteList: In(listIds) });
      await dataSource
        .getRepository(FavoritePlan)
        .delete({ idFavoriteList: In(listIds) });
      await dataSource.getRepository(FavoriteList).delete({ id: In(listIds) });
    }

    const plans = await dataSource
      .getRepository(Plan)
      .find({ where: { idUser: In(userIds) }, withDeleted: true });
    const planIds = plans.map(({ id }) => id);
    if (planIds.length > 0) {
      await dataSource
        .getRepository(PlanDetail)
        .delete({ idPlan: In(planIds) });
      await dataSource.getRepository(Plan).delete({ id: In(planIds) });
    }

    await dataSource.getRepository(AuditLog).deleteAll();
    await dataSource.getRepository(UserSession).delete({ idUser: In(userIds) });
    await dataSource.getRepository(User).delete({ id: In(userIds) });
    userIds.length = 0;
  }
});
