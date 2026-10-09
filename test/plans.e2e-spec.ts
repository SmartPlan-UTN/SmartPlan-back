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
import { createTestAppWithoutRabbit } from './create-test-app';

describe('Plan management API (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let activity: Activity;

  const registrationData = {
    name: 'Plan',
    lastName: 'Owner',
    email: 'plan-owner@smartplan.test',
    password: 'Secure-passphrase-for-smartplan1!',
  };

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

  it('saves the composer atomically, preserves retained snapshots, and makes retries safe', async () => {
    const registration = await register().expect(201);
    const auth = authorization(registration);
    const secondActivity = await dataSource.getRepository(Activity).save({
      name: 'Second plan activity',
      description: 'A second activity used to test reorder.',
      estimatedCost: 200,
      estimatedDuration: 60,
      type: 'test',
    });
    const newActivity = await dataSource.getRepository(Activity).save({
      name: 'New plan activity',
      description: 'Added after the initial save.',
      estimatedCost: 500,
      estimatedDuration: 45,
      type: 'test',
    });
    const createPayload = {
      requestId: 'c238a66d-88c1-4b96-92ce-b61d3574805e',
      title: 'Composer plan',
      description: null,
      peopleCount: 2,
      visibility: 'private',
      stops: [{ activityId: activity.id }, { activityId: secondActivity.id }],
    };
    const created = await request(app.getHttpServer())
      .post('/api/users/me/plans/composer')
      .set('Authorization', auth)
      .send(createPayload)
      .expect(201);
    const createdBody = created.body as {
      id: number;
      visibility: string;
      details: Array<{
        id: number;
        order: number;
        estimatedCost: number;
        estimatedDuration: number;
        activity: { id: number };
      }>;
    };
    const createdAgain = await request(app.getHttpServer())
      .post('/api/users/me/plans/composer')
      .set('Authorization', auth)
      .send(createPayload)
      .expect(201);
    const createdAgainBody = createdAgain.body as { id: number };

    expect(createdAgainBody.id).toBe(createdBody.id);
    expect(createdBody).toMatchObject({
      visibility: 'private',
      details: [
        { order: 1, estimatedCost: 125.5, estimatedDuration: 90 },
        { order: 2, estimatedCost: 200, estimatedDuration: 60 },
      ],
    });

    const other = await register({
      ...registrationData,
      email: 'composer-viewer@smartplan.test',
    }).expect(201);
    const otherAuth = authorization(other);
    await request(app.getHttpServer())
      .get(`/api/plans/${createdBody.id}`)
      .set('Authorization', otherAuth)
      .expect(404);
    const privateSearch = await request(app.getHttpServer())
      .get('/api/plans')
      .set('Authorization', otherAuth)
      .query({ search: 'Composer plan' })
      .expect(200);
    expect(
      (privateSearch.body as { data: Array<{ id: number }> }).data,
    ).toEqual([]);
    await request(app.getHttpServer())
      .patch(`/api/plans/${createdBody.id}/select`)
      .set('Authorization', otherAuth)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/plans/${createdBody.id}`)
      .set('Authorization', auth)
      .expect(200);

    await dataSource.getRepository(Activity).update(activity.id, {
      estimatedCost: 999,
      estimatedDuration: 999,
    });
    await dataSource.getRepository(Activity).update(secondActivity.id, {
      estimatedCost: 2200,
      estimatedDuration: 200,
    });
    const originalFirst = createdBody.details.find(
      (detail) => detail.activity.id === activity.id,
    );
    const originalSecond = createdBody.details.find(
      (detail) => detail.activity.id === secondActivity.id,
    );
    if (!originalFirst || !originalSecond) {
      throw new Error('The composer did not return both saved itinerary stops');
    }
    const updatePayload = {
      requestId: '4b9231ca-542f-4e43-a8bd-55459c822703',
      title: 'Composer plan familiar',
      description: 'Solo cambia el nombre.',
      peopleCount: 4,
      visibility: 'public',
      stops: [
        { activityId: secondActivity.id, detailId: originalSecond.id },
        { activityId: activity.id, detailId: originalFirst.id },
        { activityId: newActivity.id },
      ],
    };
    const updated = await request(app.getHttpServer())
      .put(`/api/users/me/plans/${createdBody.id}/composer`)
      .set('Authorization', auth)
      .send(updatePayload)
      .expect(200);
    const updatedBody = updated.body as {
      title: string;
      visibility: string;
      estimatedTotalCost: number;
      estimatedTotalDuration: number;
      details: Array<{
        id: number;
        order: number;
        estimatedCost: number;
        estimatedDuration: number;
      }>;
    };
    const retried = await request(app.getHttpServer())
      .put(`/api/users/me/plans/${createdBody.id}/composer`)
      .set('Authorization', auth)
      .send(updatePayload)
      .expect(200);
    const retriedBody = retried.body as { details: Array<{ id: number }> };

    expect(updatedBody).toMatchObject({
      title: 'Composer plan familiar',
      visibility: 'public',
      estimatedTotalCost: 825.5,
      estimatedTotalDuration: 195,
      details: [
        {
          id: originalSecond.id,
          order: 1,
          estimatedCost: 200,
          estimatedDuration: 60,
        },
        {
          id: originalFirst.id,
          order: 2,
          estimatedCost: 125.5,
          estimatedDuration: 90,
        },
        { order: 3, estimatedCost: 500, estimatedDuration: 45 },
      ],
    });

    const publicDetail = await request(app.getHttpServer())
      .get(`/api/plans/${createdBody.id}`)
      .set('Authorization', otherAuth)
      .expect(200);
    expect((publicDetail.body as { id: number }).id).toBe(createdBody.id);
    const publicSearch = await request(app.getHttpServer())
      .get('/api/plans')
      .set('Authorization', otherAuth)
      .query({ search: 'Composer plan familiar' })
      .expect(200);
    expect(
      (publicSearch.body as { data: Array<{ id: number }> }).data.map(
        (plan) => plan.id,
      ),
    ).toContain(createdBody.id);
    // Someone else can choose the published plan: it becomes their outing.
    const chosen = await request(app.getHttpServer())
      .post('/api/users/me/outings')
      .set('Authorization', otherAuth)
      .send({ sourcePlanId: createdBody.id })
      .expect(201);
    expect(chosen.body).toMatchObject({ created: true });

    expect(retriedBody.details).toHaveLength(3);
    expect(retriedBody.details.map((detail) => detail.id)).toEqual(
      updatedBody.details.map((detail) => detail.id),
    );

    await request(app.getHttpServer())
      .put(`/api/users/me/plans/${createdBody.id}/composer`)
      .set('Authorization', auth)
      .send({
        ...updatePayload,
        requestId: 'b402a11f-41b9-4a79-980f-849617ae4b55',
        title: 'This must roll back',
        stops: [{ activityId: newActivity.id }, { activityId: 999999 }],
      })
      .expect(404);
    const afterRollback = await request(app.getHttpServer())
      .get(`/api/users/me/plans/${createdBody.id}`)
      .set('Authorization', auth)
      .expect(200);
    const afterRollbackBody = afterRollback.body as {
      title: string;
      visibility: string;
      details: Array<{
        id: number;
        order: number;
        estimatedCost: number;
        estimatedDuration: number;
      }>;
    };
    expect(afterRollbackBody).toMatchObject({
      title: 'Composer plan familiar',
      visibility: 'public',
      details: updatedBody.details,
    });
  });

  it('enforces the composer field limits at their exact boundaries on create and update', async () => {
    const auth = authorization(await register().expect(201));
    const base = {
      title: 'Boundary plan',
      description: null as string | null,
      peopleCount: 2,
      visibility: 'private',
      stops: [{ activityId: activity.id }],
    };
    let counter = 0;
    const nextRequestId = () =>
      `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;
    const create = (overrides: Record<string, unknown>) =>
      request(app.getHttpServer())
        .post('/api/users/me/plans/composer')
        .set('Authorization', auth)
        .send({ ...base, requestId: nextRequestId(), ...overrides });

    // Inclusive upper and lower limits are accepted.
    await create({ title: 'a'.repeat(150) }).expect(201);
    await create({ description: 'a'.repeat(2000) }).expect(201);
    await create({ peopleCount: 1 }).expect(201);
    const maxPeople = await create({ peopleCount: 1000 }).expect(201);
    const planId = (maxPeople.body as { id: number }).id;

    // One past each limit is rejected, as is anything that is not a whole,
    // positive number of people or a name made only of spaces.
    await create({ title: 'a'.repeat(151) }).expect(400);
    await create({ title: '   ' }).expect(400);
    await create({ description: 'a'.repeat(2001) }).expect(400);
    await create({ peopleCount: 0 }).expect(400);
    await create({ peopleCount: 1001 }).expect(400);
    await create({ peopleCount: 2.5 }).expect(400);
    await create({ peopleCount: -1 }).expect(400);
    await create({ peopleCount: null }).expect(400);
    await create({ stops: [] }).expect(400);

    // Updating the same plan applies the same rules.
    const update = (overrides: Record<string, unknown>) =>
      request(app.getHttpServer())
        .put(`/api/users/me/plans/${planId}/composer`)
        .set('Authorization', auth)
        .send({ ...base, requestId: nextRequestId(), ...overrides });
    await update({ title: 'a'.repeat(150), peopleCount: 1000 }).expect(200);
    await update({ title: 'a'.repeat(151) }).expect(400);
    await update({ description: 'a'.repeat(2001) }).expect(400);
    await update({ peopleCount: 1001 }).expect(400);
    await update({ peopleCount: 0 }).expect(400);
    await update({ stops: [] }).expect(400);

    // A rejected update leaves the saved plan untouched.
    const after = await request(app.getHttpServer())
      .get(`/api/users/me/plans/${planId}`)
      .set('Authorization', auth)
      .expect(200);
    expect(after.body).toMatchObject({
      title: 'a'.repeat(150),
      peopleCount: 1000,
    });
  });

  it("rejects duplicate stops and other users' plans in the composer", async () => {
    const owner = authorization(await register().expect(201));
    const other = authorization(
      await register({
        ...registrationData,
        email: 'plan-intruder@smartplan.test',
      }).expect(201),
    );
    const created = await request(app.getHttpServer())
      .post('/api/users/me/plans/composer')
      .set('Authorization', owner)
      .send({
        requestId: '11111111-1111-4111-8111-111111111111',
        title: 'Mine',
        description: null,
        peopleCount: 2,
        visibility: 'private',
        stops: [{ activityId: activity.id }],
      })
      .expect(201);
    const planId = (created.body as { id: number }).id;

    await request(app.getHttpServer())
      .post('/api/users/me/plans/composer')
      .set('Authorization', owner)
      .send({
        requestId: '22222222-2222-4222-8222-222222222222',
        title: 'Twice',
        description: null,
        peopleCount: 2,
        visibility: 'private',
        stops: [{ activityId: activity.id }, { activityId: activity.id }],
      })
      .expect(400);

    const hijack = await request(app.getHttpServer())
      .put(`/api/users/me/plans/${planId}/composer`)
      .set('Authorization', other)
      .send({
        requestId: '33333333-3333-4333-8333-333333333333',
        title: 'Not mine',
        description: null,
        peopleCount: 2,
        visibility: 'public',
        stops: [{ activityId: activity.id }],
      })
      .expect(404);
    expect(hijack.body).toMatchObject({ code: 'PLAN_NOT_FOUND' });
  });

  it('does not limit total duration or the number of stops (open business decision)', async () => {
    const auth = authorization(await register().expect(201));
    const repository = dataSource.getRepository(Activity);
    const long = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        repository.save({
          name: `Six hours ${index}`,
          description: 'Duration fixture.',
          estimatedCost: 10,
          estimatedDuration: 360,
          type: 'test',
        }),
      ),
    );
    const response = await request(app.getHttpServer())
      .post('/api/users/me/plans/composer')
      .set('Authorization', auth)
      .send({
        requestId: '00000000-0000-4000-8000-000000000777',
        title: 'Viaje largo',
        description: null,
        peopleCount: 2,
        visibility: 'private',
        stops: long.map((stop) => ({ activityId: stop.id })),
      })
      .expect(201);
    // 30 h in total: accepted as sent. Whether a plan must fit in a day is a
    // business decision that nobody has made (docs/planning.md).
    expect(response.body).toMatchObject({
      activityCount: 5,
      estimatedTotalDuration: 1800,
    });
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
    await request(app.getHttpServer())
      .post('/api/users/me/plans/composer')
      .set('Authorization', auth)
      .send({
        requestId: '328a1cbb-058d-4e37-96b9-3183b7fd533d',
        title: 'Empty composer',
        description: null,
        peopleCount: 1,
        visibility: 'private',
        stops: [],
      })
      .expect(400);
    const missingActivity = await request(app.getHttpServer())
      .post(`/api/users/me/plans/${planId}/details`)
      .set('Authorization', auth)
      .send({ activityId: 999999 })
      .expect(404);
    expect(missingActivity.body).toMatchObject({ code: 'ACTIVITY_NOT_FOUND' });
  });

  it('lets the author publish a plan and make it private again (#98)', async () => {
    const auth = authorization(await register().expect(201));
    const planId = await createPlan(auth);

    const listed = await request(app.getHttpServer())
      .get('/api/users/me/plans')
      .set('Authorization', auth)
      .expect(200);
    expect(listed.body).toMatchObject({
      data: [{ id: planId, visibility: 'private' }],
    });

    const empty = await request(app.getHttpServer())
      .patch(`/api/users/me/plans/${planId}/visibility`)
      .set('Authorization', auth)
      .send({ visibility: 'public' })
      .expect(409);
    expect(empty.body).toMatchObject({ code: 'PLAN_EMPTY' });

    const withActivity = await request(app.getHttpServer())
      .post(`/api/users/me/plans/${planId}/details`)
      .set('Authorization', auth)
      .send({ activityId: activity.id })
      .expect(201);
    const detailId = (withActivity.body as { details: { id: number }[] })
      .details[0].id;
    const published = await request(app.getHttpServer())
      .patch(`/api/users/me/plans/${planId}/visibility`)
      .set('Authorization', auth)
      .send({ visibility: 'public' })
      .expect(200);
    expect(published.body).toMatchObject({ visibility: 'public' });

    // Once published, the plan cannot be emptied either.
    const emptied = await request(app.getHttpServer())
      .delete(`/api/users/me/plans/${planId}/details/${detailId}`)
      .set('Authorization', auth)
      .expect(409);
    expect(emptied.body).toMatchObject({ code: 'PLAN_EMPTY' });

    const explored = await request(app.getHttpServer())
      .get('/api/plans')
      .query({ search: 'Saturday plan' })
      .expect(200);
    expect(explored.body).toMatchObject({ data: [{ id: planId }] });

    await request(app.getHttpServer())
      .patch(`/api/users/me/plans/${planId}/visibility`)
      .set('Authorization', auth)
      .send({ visibility: 'private' })
      .expect(200);
    const hidden = await request(app.getHttpServer())
      .get('/api/plans')
      .query({ search: 'Saturday plan' })
      .expect(200);
    expect(hidden.body).toMatchObject({ data: [], pagination: { total: 0 } });
    // Private again, its last activity can go.
    await request(app.getHttpServer())
      .delete(`/api/users/me/plans/${planId}/details/${detailId}`)
      .set('Authorization', auth)
      .expect(204);

    await request(app.getHttpServer())
      .patch(`/api/users/me/plans/${planId}/visibility`)
      .set('Authorization', auth)
      .send({ visibility: 'everyone' })
      .expect(400);
  });

  it("does not let anyone else change a plan's visibility (#98)", async () => {
    const owner = authorization(await register().expect(201));
    const planId = await createPlan(owner);
    const stranger = authorization(
      await register({
        ...registrationData,
        email: 'plan-stranger@smartplan.test',
      }).expect(201),
    );

    await request(app.getHttpServer())
      .patch(`/api/users/me/plans/${planId}/visibility`)
      .set('Authorization', stranger)
      .send({ visibility: 'public' })
      .expect(404);
  });

  it('suggests catalog activities from what the plan is about (#98)', async () => {
    const auth = authorization(await register().expect(201));
    const activities = dataSource.getRepository(Activity);
    const [winery, lunch] = await activities.save([
      activities.create({
        name: 'Bodega en Luján',
        description: 'Degustación de vinos de altura.',
        estimatedCost: 40,
        estimatedDuration: 60,
        type: 'test',
      }),
      activities.create({
        name: 'Almuerzo en la bodega',
        description: 'Menú por pasos entre viñedos.',
        estimatedCost: 60,
        estimatedDuration: 90,
        type: 'test',
      }),
      activities.create({
        name: 'Trekking al cerro',
        description: 'Caminata de montaña.',
        estimatedCost: 10,
        estimatedDuration: 180,
        type: 'test',
      }),
    ]);

    const response = await request(app.getHttpServer())
      .get('/api/activity-suggestions')
      .set('Authorization', auth)
      .query({
        title: 'Tarde de bodegas y vinos',
        excludeActivityIds: `${lunch.id}`,
      })
      .expect(200);

    const names = (response.body as { data: Array<{ name: string }> }).data.map(
      (suggestion) => suggestion.name,
    );
    expect(names).toContain(winery.name);
    expect(names).not.toContain(lunch.name);
    expect(names).not.toContain('Trekking al cerro');

    const nothing = await request(app.getHttpServer())
      .get('/api/activity-suggestions')
      .set('Authorization', auth)
      .query({ title: 'a y o' })
      .expect(200);
    expect(nothing.body).toEqual({ data: [] });

    await request(app.getHttpServer())
      .get('/api/activity-suggestions')
      .set('Authorization', auth)
      .expect(400);
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
