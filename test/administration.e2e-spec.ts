import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ActivityCategory } from '../src/activities/entities/activity-category.entity';
import { ActivityPlace } from '../src/activities/entities/activity-place.entity';
import { Activity } from '../src/activities/entities/activity.entity';
import { AuditLog } from '../src/administration/entities/audit-log.entity';
import { UserSession } from '../src/auth/entities/user-session.entity';
import { AttemptLimiterService } from '../src/auth/security/attempt-limiter.service';
import { Category } from '../src/categories/entities/category.entity';
import { seedInitialData } from '../src/database/seeds/seed';
import { PlanDetail } from '../src/plans/entities/plan-detail.entity';
import { PlanStatus } from '../src/plans/entities/plan-status.entity';
import { Plan } from '../src/plans/entities/plan.entity';
import { City } from '../src/places/entities/city.entity';
import { Country } from '../src/places/entities/country.entity';
import { Department } from '../src/places/entities/department.entity';
import { Place } from '../src/places/entities/place.entity';
import { Feedback } from '../src/recommendation/entities/feedback.entity';
import { FeedbackStatus } from '../src/recommendation/entities/feedback-status.entity';
import {
  Rating,
  RatingModerationStatus,
} from '../src/ratings/entities/rating.entity';
import { Permission } from '../src/users/entities/permission.entity';
import { Role } from '../src/users/entities/role.entity';
import { RolePermission } from '../src/users/entities/role-permission.entity';
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

  it('manages custom roles and prevents deleting roles with assigned users (CU62)', async () => {
    const adminToken = await registerAndToken(
      'admin-roles@smartplan.test',
      true,
    );
    const created = await request(app.getHttpServer())
      .post('/api/admin/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        key: 'event-host',
        name: 'Event host',
        description: 'Coordinates social events.',
      })
      .expect(201);
    const id = (created.body as { id: number }).id;
    expect(created.body).toMatchObject({
      id,
      key: 'event-host',
      name: 'Event host',
    });

    await request(app.getHttpServer())
      .post('/api/admin/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'event-host', name: 'Duplicated event host' })
      .expect(409);
    await request(app.getHttpServer())
      .post('/api/admin/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'Event host', name: 'Invalid event host' })
      .expect(400);

    const listed = await request(app.getHttpServer())
      .get('/api/admin/roles?search=event-host&sortBy=key')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(listed.body).toMatchObject({
      data: [expect.objectContaining({ id, key: 'event-host' })],
    });

    await request(app.getHttpServer())
      .patch(`/api/admin/roles/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated event host', description: null })
      .expect(200)
      .expect(({ body }: { body: unknown }) => {
        expect(body).toMatchObject({
          id,
          key: 'event-host',
          name: 'Updated event host',
          description: null,
        });
      });

    const permission = await dataSource
      .getRepository(Permission)
      .findOneByOrFail({ key: 'activity.list' });
    await request(app.getHttpServer())
      .put(`/api/admin/roles/${id}/permissions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ permissionIds: [permission.id] })
      .expect(200)
      .expect(({ body }: { body: unknown }) => {
        expect(body).toMatchObject({
          id,
          permissions: [expect.objectContaining({ id: permission.id })],
        });
      });

    const administrator = await dataSource
      .getRepository(Role)
      .findOneByOrFail({ key: 'admin' });
    await request(app.getHttpServer())
      .patch(`/api/admin/roles/${administrator.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Changed administrator' })
      .expect(409);

    await registerAndToken('custom-role-user@smartplan.test', false);
    const target = await dataSource.getRepository(User).findOneByOrFail({
      email: 'custom-role-user@smartplan.test',
    });
    await request(app.getHttpServer())
      .patch(`/api/admin/users/${target.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'event-host' })
      .expect(200)
      .expect(({ body }: { body: unknown }) => {
        expect(body).toMatchObject({
          id: target.id,
          role: { key: 'event-host' },
        });
      });
    await request(app.getHttpServer())
      .delete(`/api/admin/roles/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);

    await request(app.getHttpServer())
      .patch(`/api/admin/users/${target.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'user' })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/admin/roles/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .delete(`/api/admin/roles/${administrator.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);
    await expect(
      dataSource.getRepository(Role).findOneBy({ id }),
    ).resolves.toBeNull();
    const assignments = await dataSource.getRepository(RolePermission).find({
      where: { idRole: id },
      withDeleted: true,
    });
    expect(assignments).toHaveLength(1);
    expect(assignments[0].deletedAt).not.toBeNull();
  });

  it('creates, lists, updates, and deletes catalog activities (CU53)', async () => {
    const adminToken = await registerAndToken(
      'admin-activities@smartplan.test',
      true,
    );
    const category = await dataSource
      .getRepository(Category)
      .findOneByOrFail({});
    const country = await dataSource.getRepository(Country).save({
      name: 'Administration test country',
      description: null,
    });
    const city = await dataSource.getRepository(City).save({
      idCountry: country.id,
      name: 'Administration test city',
      description: null,
    });
    const department = await dataSource.getRepository(Department).save({
      idCity: city.id,
      name: 'Administration test department',
      description: null,
    });
    const places = await dataSource.getRepository(Place).save([
      {
        idDepartment: department.id,
        name: 'Administration first place',
        description: null,
        address: 'First test address',
      },
      {
        idDepartment: department.id,
        name: 'Administration second place',
        description: null,
        address: 'Second test address',
      },
    ]);
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
        placeIds: [places[0].id],
      })
      .expect(201);
    const id = (created.body as { id: number }).id;
    expect(created.body).toMatchObject({
      id,
      name: 'Administration activity',
      categories: [{ id: category.id }],
      places: [
        {
          id: places[0].id,
          name: places[0].name,
          address: places[0].address,
        },
      ],
    });

    const synchronizedRelation = await dataSource
      .getRepository(ActivityPlace)
      .findOneByOrFail({ idActivity: id, idPlace: places[0].id });
    synchronizedRelation.googlePlaceId = 'ChIJ-admin-retained';
    synchronizedRelation.latitude = -32.89;
    synchronizedRelation.longitude = -68.84;
    synchronizedRelation.externalRating = 4.5;
    synchronizedRelation.externalRatingCount = 25;
    await dataSource.getRepository(ActivityPlace).save(synchronizedRelation);

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
      .send({
        name: 'Updated administration activity',
        categoryIds: [],
        placeIds: [places[0].id, places[1].id],
      })
      .expect(200);
    expect(updated.body).toMatchObject({
      id,
      name: 'Updated administration activity',
      categories: [],
      places: [
        expect.objectContaining({ id: places[0].id }),
        expect.objectContaining({ id: places[1].id }),
      ],
    });

    const retainedRelation = await dataSource
      .getRepository(ActivityPlace)
      .findOneByOrFail({ idActivity: id, idPlace: places[0].id });
    expect(retainedRelation).toMatchObject({
      id: synchronizedRelation.id,
      googlePlaceId: 'ChIJ-admin-retained',
      latitude: -32.89,
      longitude: -68.84,
      externalRating: 4.5,
      externalRatingCount: 25,
    });

    await request(app.getHttpServer())
      .post('/api/admin/activities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Activity without a physical place',
        description: 'Board games can be enjoyed at home.',
        estimatedCost: 0,
        estimatedDuration: 60,
        categoryIds: [],
        placeIds: [],
      })
      .expect(201)
      .expect(({ body }: { body: { places: unknown[] } }) => {
        expect(body.places).toEqual([]);
      });

    await request(app.getHttpServer())
      .post('/api/admin/activities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Duplicated places',
        description: 'Invalid duplicated place ids.',
        estimatedCost: 0,
        estimatedDuration: 60,
        categoryIds: [],
        placeIds: [places[0].id, places[0].id],
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/admin/activities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Missing place',
        description: 'Invalid missing place id.',
        estimatedCost: 0,
        estimatedDuration: 60,
        categoryIds: [],
        placeIds: [2_000_000_000],
      })
      .expect(404);

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
    const removedRelations = await dataSource
      .getRepository(ActivityPlace)
      .find({
        where: { idActivity: id },
        withDeleted: true,
      });
    expect(removedRelations).toHaveLength(2);
    expect(
      removedRelations.every((relation) => relation.deletedAt !== null),
    ).toBe(true);

    // This suite shares one database with every e2e file. Remove the complete
    // geographic fixture after asserting the soft-deleted associations so the
    // data-model suite can clear countries without a foreign-key conflict.
    await dataSource.getRepository(ActivityPlace).delete({ idActivity: id });
    await dataSource.getRepository(Place).delete(places.map(({ id }) => id));
    await dataSource.getRepository(Department).delete(department.id);
    await dataSource.getRepository(City).delete(city.id);
    await dataSource.getRepository(Country).delete(country.id);
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
          activity: { id: number; name: string };
          plan: { id: number; title: string };
          moderationStatus: string;
        }>;
      }
    ).data.find((item) => item.id === rating.id);
    expect(listedRating).toMatchObject({
      id: rating.id,
      author: { id: author.id },
      activity: { id: activity.id, name: 'Rated activity' },
      plan: { id: plan.id, title: 'Rated plan' },
      moderationStatus: 'pending',
    });

    const moderated = await request(app.getHttpServer())
      .patch(`/api/admin/ratings/${rating.id}/moderation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved' })
      .expect(200);
    expect(moderated.body).toMatchObject({
      id: rating.id,
      activity: { id: activity.id, name: 'Rated activity' },
      plan: { id: plan.id, title: 'Rated plan' },
      moderationStatus: 'approved',
      moderationReason: null,
    });
    await request(app.getHttpServer())
      .patch(`/api/admin/ratings/${rating.id}/moderation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'rejected' })
      .expect(400);
  });

  it('removes inappropriate ratings and records the administrator (CU56)', async () => {
    const adminToken = await registerAndToken(
      'content-admin@smartplan.test',
      true,
    );
    const regularToken = await registerAndToken(
      'content-regular@smartplan.test',
      false,
    );
    const author = await dataSource.getRepository(User).findOneByOrFail({
      email: 'content-regular@smartplan.test',
    });
    const administrator = await dataSource.getRepository(User).findOneByOrFail({
      email: 'content-admin@smartplan.test',
    });
    const activity = await dataSource.getRepository(Activity).save({
      name: 'Content moderation activity',
      description: 'Activity used by the content deletion test.',
      estimatedCost: 20,
      estimatedDuration: 30,
      type: null,
    });
    const completed = await dataSource
      .getRepository(PlanStatus)
      .findOneByOrFail({ key: 'completed' });
    const plan = await dataSource.getRepository(Plan).save({
      title: 'Content moderation plan',
      description: null,
      idUser: author.id,
      idPlanRequest: null,
      idPlanStatus: completed.id,
      estimatedTotalCost: 20,
      estimatedTotalDuration: 30,
      peopleCount: 2,
    });
    const rating = await dataSource.getRepository(Rating).save({
      score: 1,
      idActivity: activity.id,
      idUser: author.id,
      idPlan: plan.id,
      comment: 'Inappropriate rating content.',
      moderationStatus: RatingModerationStatus.Pending,
      moderationReason: null,
      idFeedback: null,
    });

    await request(app.getHttpServer())
      .delete(`/api/admin/ratings/${rating.id}`)
      .set('Authorization', `Bearer ${regularToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/api/admin/ratings/${rating.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'x'.repeat(501) })
      .expect(400);
    await request(app.getHttpServer())
      .delete(`/api/admin/ratings/${rating.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Violates the community rules.' })
      .expect(204);

    await expect(
      dataSource.getRepository(Rating).findOneBy({ id: rating.id }),
    ).resolves.toBeNull();
    const audit = await dataSource.getRepository(AuditLog).findOneByOrFail({
      affectedEntity: 'rating',
      affectedEntityId: rating.id,
    });
    expect(audit).toMatchObject({
      action: 'delete',
      idActor: administrator.id,
      changes: { reason: 'Violates the community rules.' },
    });
    expect(audit.createdAt).toBeInstanceOf(Date);

    await request(app.getHttpServer())
      .delete('/api/admin/ratings/999999')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('lists and reviews user feedback with an audit actor (CU59)', async () => {
    const adminToken = await registerAndToken(
      'feedback-admin@smartplan.test',
      true,
    );
    const regularToken = await registerAndToken(
      'feedback-author@smartplan.test',
      false,
    );
    const author = await dataSource.getRepository(User).findOneByOrFail({
      email: 'feedback-author@smartplan.test',
    });
    const administrator = await dataSource.getRepository(User).findOneByOrFail({
      email: 'feedback-admin@smartplan.test',
    });
    const completed = await dataSource
      .getRepository(PlanStatus)
      .findOneByOrFail({ key: 'completed' });
    const pending = await dataSource
      .getRepository(FeedbackStatus)
      .findOneByOrFail({ key: 'pending' });
    const plan = await dataSource.getRepository(Plan).save({
      title: 'Feedback plan',
      description: null,
      idUser: author.id,
      idPlanRequest: null,
      idPlanStatus: completed.id,
      estimatedTotalCost: 20,
      estimatedTotalDuration: 90,
      peopleCount: 2,
    });
    const feedback = await dataSource.getRepository(Feedback).save({
      rating: 4,
      tags: ['great_value'],
      comment: 'It was a great plan.',
      actualCost: 18,
      actualDuration: 80,
      idPlan: plan.id,
      idFeedbackStatus: pending.id,
    });

    await request(app.getHttpServer())
      .get('/api/admin/feedback')
      .set('Authorization', `Bearer ${regularToken}`)
      .expect(403);
    const listed = await request(app.getHttpServer())
      .get('/api/admin/feedback')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(listed.body).toMatchObject({
      data: [
        {
          id: feedback.id,
          status: { key: 'pending' },
          plan: { id: plan.id, title: plan.title },
          author: { id: author.id, email: author.email },
        },
      ],
    });

    const reviewed = await request(app.getHttpServer())
      .patch(`/api/admin/feedback/${feedback.id}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'processed', note: 'Included in the next model review.' })
      .expect(200);
    expect(reviewed.body).toMatchObject({
      id: feedback.id,
      status: { key: 'processed' },
    });
    const audit = await dataSource.getRepository(AuditLog).findOneByOrFail({
      affectedEntity: 'feedback',
      affectedEntityId: feedback.id,
    });
    expect(audit).toMatchObject({
      action: 'update',
      idActor: administrator.id,
      changes: {
        from: 'pending',
        to: 'processed',
        note: 'Included in the next model review.',
      },
    });

    await request(app.getHttpServer())
      .patch(`/api/admin/feedback/${feedback.id}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'discarded' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/admin/feedback/${feedback.id}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'pending' })
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
    await dataSource.getRepository(Feedback).deleteAll();
    await dataSource.getRepository(PlanDetail).deleteAll();
    await dataSource.getRepository(Plan).deleteAll();
    await dataSource.getRepository(ActivityCategory).deleteAll();
    await dataSource.getRepository(Activity).deleteAll();
    await dataSource.getRepository(AuditLog).deleteAll();
    await dataSource.getRepository(UserSession).deleteAll();
    await dataSource.getRepository(User).deleteAll();
  }
});
