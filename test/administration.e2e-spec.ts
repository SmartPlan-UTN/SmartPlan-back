import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ActivityCategory } from '../src/activities/entities/activity-category.entity';
import { Activity } from '../src/activities/entities/activity.entity';
import { AuditLog } from '../src/administration/entities/audit-log.entity';
import { UserSession } from '../src/auth/entities/user-session.entity';
import { AttemptLimiterService } from '../src/auth/security/attempt-limiter.service';
import { Category } from '../src/categories/entities/category.entity';
import { seedInitialData } from '../src/database/seeds/seed';
import { PlanDetail } from '../src/plans/entities/plan-detail.entity';
import { PlanStatus } from '../src/plans/entities/plan-status.entity';
import { Plan } from '../src/plans/entities/plan.entity';
import {
  Rating,
  RatingModerationStatus,
} from '../src/ratings/entities/rating.entity';
import { Role } from '../src/users/entities/role.entity';
import { User } from '../src/users/entities/user.entity';
import { createTestApp } from './create-test-app';

describe('Administration API (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const password = 'secure-passphrase-for-smartplan';

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
  });

  it('restricts the administration module to administrators', async () => {
    const regularToken = await registerAndToken(
      'regular-admin-check@smartplan.test',
      false,
    );
    await request(app.getHttpServer()).get('/api/admin/users').expect(401);
    await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${regularToken}`)
      .expect(403);
  });

  it('lists users and suspends, bans, and reactivates an account (CU57)', async () => {
    const adminToken = await registerAndToken(
      'admin-users@smartplan.test',
      true,
    );
    const targetToken = await registerAndToken(
      'managed-user@smartplan.test',
      false,
    );
    const target = await dataSource.getRepository(User).findOneByOrFail({
      email: 'managed-user@smartplan.test',
    });

    const listed = await request(app.getHttpServer())
      .get('/api/admin/users?status=active&sortBy=email')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(listed.body).toMatchObject({
      pagination: { page: 1, limit: 20 },
    });
    const listedTarget = (
      listed.body as {
        data: Array<{
          id: number;
          email: string;
          status: { key: string };
        }>;
      }
    ).data.find((user) => user.id === target.id);
    expect(listedTarget).toMatchObject({
      id: target.id,
      email: target.email,
      status: { key: 'active' },
    });
    expect(JSON.stringify(listed.body)).not.toContain('passwordHash');

    await request(app.getHttpServer())
      .get('/api/admin/users?sortBy=role&direction=asc')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const updated = await request(app.getHttpServer())
      .patch(`/api/admin/users/${target.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Managed',
        lastName: 'Updated',
        email: 'managed-user-updated@smartplan.test',
        role: 'admin',
      })
      .expect(200);
    expect(updated.body).toMatchObject({
      id: target.id,
      name: 'Managed',
      lastName: 'Updated',
      email: 'managed-user-updated@smartplan.test',
      role: { key: 'admin' },
    });
    expect(updated.body).not.toHaveProperty('passwordHash');

    await request(app.getHttpServer())
      .patch(`/api/admin/users/${target.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/users?limit=0')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    for (const status of ['suspended', 'banned', 'active']) {
      const changed = await request(app.getHttpServer())
        .patch(`/api/admin/users/${target.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status })
        .expect(200);
      expect(changed.body).toMatchObject({
        id: target.id,
        status: { key: status },
      });
    }
    await request(app.getHttpServer())
      .patch(`/api/admin/users/${target.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'unknown' })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Authorization', `Bearer ${targetToken}`)
      .expect(401);
  });

  it('creates, lists, updates, and deletes catalog activities (CU53)', async () => {
    const adminToken = await registerAndToken(
      'admin-activities@smartplan.test',
      true,
    );
    const category = await dataSource
      .getRepository(Category)
      .findOneByOrFail({});
    const created = await request(app.getHttpServer())
      .post('/api/admin/activities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Administration activity',
        description: 'Created from the administration API.',
        estimatedCost: 125.5,
        estimatedDuration: 90,
        type: 'cultural',
        categoryIds: [category.id],
      })
      .expect(201);
    const id = (created.body as { id: number }).id;
    expect(created.body).toMatchObject({
      id,
      name: 'Administration activity',
      categories: [{ id: category.id }],
    });

    const listed = await request(app.getHttpServer())
      .get(
        `/api/admin/activities?search=Administration&categoryId=${category.id}&sortBy=name`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(listed.body).toMatchObject({
      data: [expect.objectContaining({ id })],
      pagination: { total: 1 },
    });

    const updated = await request(app.getHttpServer())
      .patch(`/api/admin/activities/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated administration activity', categoryIds: [] })
      .expect(200);
    expect(updated.body).toMatchObject({
      id,
      name: 'Updated administration activity',
      categories: [],
    });

    await request(app.getHttpServer())
      .patch(`/api/admin/activities/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/admin/activities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '', estimatedCost: -1, categoryIds: [] })
      .expect(400);

    await request(app.getHttpServer())
      .delete(`/api/admin/activities/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);
    await expect(
      dataSource.getRepository(Activity).findOneBy({ id }),
    ).resolves.toBeNull();
  });

  it('manages category lifecycle and protects categories in use (CU54)', async () => {
    const adminToken = await registerAndToken(
      'admin-categories@smartplan.test',
      true,
    );
    await request(app.getHttpServer())
      .post('/api/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '' })
      .expect(400);
    const created = await request(app.getHttpServer())
      .post('/api/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Category lifecycle',
        description: 'Temporary category for the administrative lifecycle.',
      })
      .expect(201);
    const id = (created.body as { id: number }).id;
    expect(created.body).toMatchObject({
      id,
      name: 'Category lifecycle',
      status: { key: 'active', name: 'Active' },
    });

    const listed = await request(app.getHttpServer())
      .get('/api/admin/categories?status=active&sortBy=name')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const listedBody = listed.body as {
      data: Array<{ id: number }>;
      pagination: { total: number };
    };
    expect(listedBody.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id })]),
    );
    expect(listedBody.pagination.total).toEqual(expect.any(Number));

    await request(app.getHttpServer())
      .post('/api/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'category lifecycle' })
      .expect(409);

    await request(app.getHttpServer())
      .patch(`/api/admin/categories/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'inactive', description: null })
      .expect(200)
      .expect(({ body }: { body: unknown }) => {
        expect(body).toMatchObject({
          id,
          description: null,
          status: { key: 'inactive' },
        });
      });

    const publicCategories = await request(app.getHttpServer())
      .get(`/api/categories?search=Category%20lifecycle`)
      .expect(200);
    expect((publicCategories.body as { data: unknown[] }).data).toEqual([]);

    await request(app.getHttpServer())
      .post('/api/admin/activities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Inactive category activity',
        description: 'This association must be rejected.',
        estimatedCost: 100,
        estimatedDuration: 60,
        categoryIds: [id],
      })
      .expect(422);

    await request(app.getHttpServer())
      .patch(`/api/admin/categories/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'active' })
      .expect(200);
    const activity = await dataSource.getRepository(Activity).save({
      name: 'Category deletion guard',
      description: 'References the category to prevent deletion.',
      estimatedCost: 0,
      estimatedDuration: 1,
      type: null,
    });
    await dataSource.getRepository(ActivityCategory).save({
      idActivity: activity.id,
      idCategory: id,
    });
    await request(app.getHttpServer())
      .delete(`/api/admin/categories/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);

    await dataSource.getRepository(ActivityCategory).delete({ idCategory: id });
    await dataSource.getRepository(Activity).delete(activity.id);
    await request(app.getHttpServer())
      .delete(`/api/admin/categories/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);
    await expect(
      dataSource.getRepository(Category).findOneBy({ id }),
    ).resolves.toBeNull();
  });

  it('lists, updates, and deletes plans of any user (CU60)', async () => {
    const adminToken = await registerAndToken(
      'admin-plans@smartplan.test',
      true,
    );
    await registerAndToken('plan-owner@smartplan.test', false);
    const owner = await dataSource.getRepository(User).findOneByOrFail({
      email: 'plan-owner@smartplan.test',
    });
    const confirmed = await dataSource
      .getRepository(PlanStatus)
      .findOneByOrFail({ key: 'confirmed' });
    const plan = await dataSource.getRepository(Plan).save({
      title: 'Managed plan',
      description: 'Plan before administration update.',
      idUser: owner.id,
      idPlanRequest: null,
      idPlanStatus: confirmed.id,
      estimatedTotalCost: 0,
      estimatedTotalDuration: 0,
      peopleCount: 2,
    });

    const listed = await request(app.getHttpServer())
      .get('/api/admin/plans?status=confirmed&sortBy=title')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const listedPlan = (
      listed.body as {
        data: Array<{
          id: number;
          owner: { id: number; email: string };
          status: { key: string };
        }>;
      }
    ).data.find((item) => item.id === plan.id);
    expect(listedPlan).toMatchObject({
      id: plan.id,
      owner: { id: owner.id, email: owner.email },
      status: { key: 'confirmed' },
    });

    const updated = await request(app.getHttpServer())
      .patch(`/api/admin/plans/${plan.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Updated managed plan', status: 'completed' })
      .expect(200);
    expect(updated.body).toMatchObject({
      id: plan.id,
      title: 'Updated managed plan',
      status: { key: 'completed' },
    });

    await request(app.getHttpServer())
      .patch(`/api/admin/plans/${plan.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ peopleCount: 0 })
      .expect(400);

    await request(app.getHttpServer())
      .delete(`/api/admin/plans/${plan.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);
    await expect(
      dataSource.getRepository(Plan).findOneBy({ id: plan.id }),
    ).resolves.toBeNull();
  });

  it('lists and moderates ratings (CU55)', async () => {
    const adminToken = await registerAndToken(
      'admin-ratings@smartplan.test',
      true,
    );
    await registerAndToken('rating-author@smartplan.test', false);
    const author = await dataSource.getRepository(User).findOneByOrFail({
      email: 'rating-author@smartplan.test',
    });
    const activity = await dataSource.getRepository(Activity).save({
      name: 'Rated activity',
      description: 'Activity for moderation.',
      estimatedCost: 25,
      estimatedDuration: 30,
      type: null,
    });
    const completed = await dataSource
      .getRepository(PlanStatus)
      .findOneByOrFail({ key: 'completed' });
    const plan = await dataSource.getRepository(Plan).save({
      title: 'Rated plan',
      description: null,
      idUser: author.id,
      idPlanRequest: null,
      idPlanStatus: completed.id,
      estimatedTotalCost: 25,
      estimatedTotalDuration: 30,
      peopleCount: 2,
    });
    const rating = await dataSource.getRepository(Rating).save({
      score: 4,
      idActivity: activity.id,
      idUser: author.id,
      idPlan: plan.id,
      comment: 'Pending moderation.',
      moderationStatus: RatingModerationStatus.Pending,
      moderationReason: 'Manual review required.',
      idFeedback: null,
    });

    const listed = await request(app.getHttpServer())
      .get('/api/admin/ratings?status=pending')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const listedRating = (
      listed.body as {
        data: Array<{
          id: number;
          author: { id: number };
          moderationStatus: string;
        }>;
      }
    ).data.find((item) => item.id === rating.id);
    expect(listedRating).toMatchObject({
      id: rating.id,
      author: { id: author.id },
      moderationStatus: 'pending',
    });

    const moderated = await request(app.getHttpServer())
      .patch(`/api/admin/ratings/${rating.id}/moderation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved' })
      .expect(200);
    expect(moderated.body).toMatchObject({
      id: rating.id,
      moderationStatus: 'approved',
      moderationReason: null,
    });
    await request(app.getHttpServer())
      .patch(`/api/admin/ratings/${rating.id}/moderation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'rejected' })
      .expect(400);
  });

  it('returns aggregate REP-01 metrics for the selected range (CU58)', async () => {
    const adminToken = await registerAndToken(
      'admin-metrics@smartplan.test',
      true,
    );
    const administrator = await dataSource.getRepository(User).findOneByOrFail({
      email: 'admin-metrics@smartplan.test',
    });
    const confirmed = await dataSource
      .getRepository(PlanStatus)
      .findOneByOrFail({ key: 'confirmed' });
    const activity = await dataSource.getRepository(Activity).save({
      name: 'Popular metrics activity',
      description: 'Used by the metrics aggregation test.',
      estimatedCost: 50,
      estimatedDuration: 60,
      type: 'cultural',
    });
    const plans = await dataSource.getRepository(Plan).save([
      {
        title: 'First retained plan',
        description: null,
        idUser: administrator.id,
        idPlanRequest: null,
        idPlanStatus: confirmed.id,
        estimatedTotalCost: 50,
        estimatedTotalDuration: 60,
        peopleCount: 2,
      },
      {
        title: 'Second retained plan',
        description: null,
        idUser: administrator.id,
        idPlanRequest: null,
        idPlanStatus: confirmed.id,
        estimatedTotalCost: 0,
        estimatedTotalDuration: 0,
        peopleCount: 2,
      },
    ]);
    await dataSource.getRepository(PlanDetail).save({
      idPlan: plans[0].id,
      idActivity: activity.id,
      order: 1,
      estimatedCost: 50,
      estimatedDuration: 60,
      note: null,
    });
    await dataSource.getRepository(Rating).save({
      score: 4,
      idActivity: activity.id,
      idUser: administrator.id,
      idPlan: plans[0].id,
      comment: null,
      moderationStatus: RatingModerationStatus.Approved,
      moderationReason: null,
      idFeedback: null,
    });
    const response = await request(app.getHttpServer())
      .get('/api/admin/metrics?range=7d')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(response.body).toMatchObject({
      range: { key: '7d' },
      kpis: {
        totalUsers: 1,
        activePlans: 2,
        catalogActivities: 1,
        pendingRatings: 0,
      },
      acceptanceRate: 100,
      averageRating: 4,
      retentionRate: 100,
      distributions: {
        moods: [],
        groupSizes: [
          { key: 'couple', name: 'Couple', count: 2, percentage: 100 },
        ],
      },
      popularActivities: [
        { id: activity.id, name: activity.name, planCount: 1 },
      ],
      recentActivity: expect.any(Array) as unknown[],
    });
    const { recentActivity } = response.body as { recentActivity: unknown[] };
    expect(recentActivity).toContainEqual(
      expect.objectContaining({
        affectedEntity: 'user',
        affectedEntityId: administrator.id,
        label: 'Test Account',
      }),
    );
    await request(app.getHttpServer())
      .get('/api/admin/metrics?range=year')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  async function registerAndToken(
    email: string,
    administrator: boolean,
  ): Promise<string> {
    const registration = await request(app.getHttpServer())
      .post('/api/users')
      .send({ name: 'Test', lastName: 'Account', email, password })
      .expect(201);
    if (!administrator) return accessToken(registration.body);

    const role = await dataSource
      .getRepository(Role)
      .findOneByOrFail({ key: 'admin' });
    await dataSource.getRepository(User).update({ email }, { idRole: role.id });
    const login = await request(app.getHttpServer())
      .post('/api/sessions')
      .send({ email, password })
      .expect(201);
    return accessToken(login.body);
  }

  function accessToken(body: unknown): string {
    if (
      typeof body !== 'object' ||
      body === null ||
      !('accessToken' in body) ||
      typeof body.accessToken !== 'string'
    ) {
      throw new Error('The response did not include accessToken');
    }
    return body.accessToken;
  }

  async function clearData(): Promise<void> {
    await dataSource.getRepository(Rating).deleteAll();
    await dataSource.getRepository(PlanDetail).deleteAll();
    await dataSource.getRepository(Plan).deleteAll();
    await dataSource.getRepository(ActivityCategory).deleteAll();
    await dataSource.getRepository(Activity).deleteAll();
    await dataSource.getRepository(AuditLog).deleteAll();
    await dataSource.getRepository(UserSession).deleteAll();
    await dataSource.getRepository(User).deleteAll();
  }
});
