import { INestApplication } from '@nestjs/common';
import { AuditLog } from '../src/administration/entities/audit-log.entity';
import { App } from 'supertest/types';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { seedInitialData } from '../src/database/seeds/seed';
import { Feedback } from '../src/recommendation/entities/feedback.entity';
import { Plan, PlanKind } from '../src/plans/entities/plan.entity';
import { UserSession } from '../src/auth/entities/user-session.entity';
import { User } from '../src/users/entities/user.entity';
import { createTestAppWithoutRabbit } from './create-test-app';
import { Country } from '../src/places/entities/country.entity';
import { City } from '../src/places/entities/city.entity';
import { Department } from '../src/places/entities/department.entity';
import { Place } from '../src/places/entities/place.entity';
import { PlanDetail } from '../src/plans/entities/plan-detail.entity';
import { PersonalSignalsService } from '../src/planning-engine/ranking/personal-signals.service';

// Feedback belongs to an outing: a person's own copy of a plan they did (#98).
describe('Plan feedback API (e2e, CU23)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let accessToken: string;
  let otherAccessToken: string;
  let userId: number;

  beforeAll(async () => {
    app = await createTestAppWithoutRabbit();
    dataSource = app.get(DataSource);
    await seedInitialData(dataSource);

    const registration = await request(app.getHttpServer())
      .post('/api/users')
      .send({
        name: 'Feedback',
        lastName: 'Uno',
        email: 'feedback-user@example.com',
        password: 'Secure-passphrase-for-smartplan1!',
      });
    accessToken = (registration.body as { accessToken: string }).accessToken;
    userId = (registration.body as { user: { id: number } }).user.id;

    const otherRegistration = await request(app.getHttpServer())
      .post('/api/users')
      .send({
        name: 'Feedback',
        lastName: 'Dos',
        email: 'other-feedback-user@example.com',
        password: 'Secure-passphrase-for-smartplan1!',
      });
    otherAccessToken = (otherRegistration.body as { accessToken: string })
      .accessToken;
  });

  afterAll(async () => {
    await dataSource.getRepository(Feedback).deleteAll();
    await dataSource.getRepository(Plan).deleteAll();
    await dataSource.getRepository(UserSession).deleteAll();
    await dataSource.getRepository(AuditLog).deleteAll();
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

  async function createPlan(
    statusKey: string,
    extra: Partial<Plan> = {},
  ): Promise<Plan> {
    const plans = dataSource.getRepository(Plan);
    return plans.save(
      plans.create({
        idUser: userId,
        kind: PlanKind.Outing,
        completedAt: statusKey === 'completed' ? new Date() : null,
        idPlanStatus: await planStatusId(statusKey),
        title: 'Feedback test plan',
        description: 'desc',
        estimatedTotalCost: 1000,
        estimatedTotalDuration: 60,
        ...extra,
      }),
    );
  }

  it('learns only explicit stop spending and queues reported facts for revalidation', async () => {
    const country = await dataSource
      .getRepository(Country)
      .save({ name: 'Feedback fixture country' });
    const city = await dataSource
      .getRepository(City)
      .save({ name: 'Feedback fixture city', idCountry: country.id });
    const department = await dataSource
      .getRepository(Department)
      .save({ name: 'Feedback fixture department', idCity: city.id });
    const places = await dataSource.getRepository(Place).save(
      [0, 1, 2].map((index) => ({
        name: `Feedback fixture restaurant ${index}`,
        address: `Fixture street ${index}`,
        kind: 'restaurant',
        idDepartment: department.id,
        latitude: -32.89 + index * 0.001,
        longitude: -68.85,
        status: 'published',
        discoverable: true,
      })),
    );
    const plan = await createPlan('completed', { peopleCount: 2 });
    const details = await dataSource.getRepository(PlanDetail).save(
      places.map((place, index) => ({
        idPlan: plan.id,
        idPlace: place.id,
        idActivity: null,
        action: 'meal',
        order: index + 1,
        estimatedDuration: 60,
        estimatedCost: null,
        priceKind: 'UNKNOWN' as const,
      })),
    );
    await request(app.getHttpServer())
      .post(`/api/plans/${plan.id}/feedback`)
      .set(...authorization(accessToken))
      .send({
        rating: 4,
        actualCost: 60000,
        partySize: 2,
        stops: [
          {
            detailId: details[0].id,
            status: 'DONE',
            amount: 20000,
            tags: ['quiet'],
          },
          { detailId: details[1].id, status: 'SKIPPED', report: 'CLOSED' },
          { detailId: details[2].id, status: 'DONE' },
        ],
      })
      .expect(201);
    const observations = await dataSource.query<Record<string, unknown>[]>(
      'SELECT id_place, amount_reported, party_size, amount_per_person FROM activity_price_observation WHERE id_place = ANY($1)',
      [places.map((place) => place.id)],
    );
    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({
      id_place: places[0].id,
      party_size: 2,
    });
    expect(Number(observations[0].amount_reported)).toBe(20000);
    expect(Number(observations[0].amount_per_person)).toBe(10000);
    const revalidations = await dataSource.query<Record<string, unknown>[]>(
      'SELECT reason, status FROM knowledge_revalidation WHERE id_place = $1',
      [places[1].id],
    );
    expect(revalidations).toContainEqual(
      expect.objectContaining({
        reason: 'USER_REPORT_CLOSED',
        status: 'PENDING',
      }),
    );
    const traits = await dataSource.query<Record<string, unknown>[]>(
      'SELECT trait, source, support_count FROM place_trait WHERE id_place = $1',
      [places[0].id],
    );
    expect(traits).toContainEqual(
      expect.objectContaining({
        trait: 'quiet',
        source: 'COMMUNITY',
        support_count: 1,
      }),
    );
    const signals = await new PersonalSignalsService(dataSource).load(userId);
    expect(signals.avoided).toContain(places[1].id);
  });

  it('submits feedback for a completed outing as pending', async () => {
    const plan = await createPlan('completed');

    const response = await request(app.getHttpServer())
      .post(`/api/plans/${plan.id}/feedback`)
      .set(...authorization(accessToken))
      .send({ rating: 5, tags: ['great_value'], comment: 'Loved it' })
      .expect(201);

    expect(response.body).toMatchObject({
      rating: 5,
      tags: ['great_value'],
      comment: 'Loved it',
    });
    // The response is a sanitised DTO, not the raw entity.
    expect(response.body).not.toHaveProperty('deletedAt');
    expect(response.body).not.toHaveProperty('idFeedbackStatus');
    expect(response.body).not.toHaveProperty('idPlan');

    const stored = await dataSource.getRepository(Feedback).findOneOrFail({
      where: { idPlan: plan.id },
      relations: { status: true },
    });
    expect(stored.status.key).toBe('pending');
  });

  it('edits an existing experience and returns it through Mis salidas', async () => {
    const plan = await createPlan('completed');
    const created = await request(app.getHttpServer())
      .post(`/api/plans/${plan.id}/feedback`)
      .set(...authorization(accessToken))
      .send({
        rating: 3,
        comment: 'Before',
        tags: ['great_value'],
        actualCost: 1500,
      })
      .expect(201);
    const edited = await request(app.getHttpServer())
      .patch(`/api/plans/${plan.id}/feedback`)
      .set(...authorization(accessToken))
      .send({ rating: 5, comment: '  After  ' })
      .expect(200);
    expect(edited.body).toMatchObject({
      id: (created.body as { id: number }).id,
      rating: 5,
      comment: 'After',
      tags: ['great_value'],
      actualCost: 1500,
      shared: false,
    });
    const list = await request(app.getHttpServer())
      .get('/api/users/me/outings?status=completed')
      .set(...authorization(accessToken))
      .expect(200);
    expect(list.body).toMatchObject({
      data: [{ id: plan.id, feedback: { rating: 5, comment: 'After' } }],
    });
    await request(app.getHttpServer())
      .patch(`/api/plans/${plan.id}/feedback`)
      .set(...authorization(otherAccessToken))
      .send({ rating: 1 })
      .expect(404);
    const cleared = await request(app.getHttpServer())
      .patch(`/api/plans/${plan.id}/feedback`)
      .set(...authorization(accessToken))
      .send({ comment: null })
      .expect(200);
    expect(cleared.body).toMatchObject({ rating: 5, comment: null });
  });

  it.each([
    { rating: 0 },
    { rating: 6 },
    { rating: null },
    { rating: 2.5 },
    { comment: 'x'.repeat(1001) },
    { shared: null },
    {},
  ])('rejects invalid experience edits %p', async (body) => {
    const plan = await createPlan('completed');
    await request(app.getHttpServer())
      .patch(`/api/plans/${plan.id}/feedback`)
      .set(...authorization(accessToken))
      .send(body)
      .expect(400);
  });

  it('finds own rated outings of the requested original plan, including private feedback', async () => {
    const source = await createPlan('confirmed', { kind: PlanKind.Authored });
    const matching = await createPlan('completed', { idSourcePlan: source.id });
    const other = await createPlan('completed');
    for (const plan of [matching, other]) {
      await request(app.getHttpServer())
        .post(`/api/plans/${plan.id}/feedback`)
        .set(...authorization(accessToken))
        .send({ rating: 4, comment: 'Private experience' })
        .expect(201);
    }
    const result = await request(app.getHttpServer())
      .get(
        `/api/users/me/outings?status=completed&rated=true&sourcePlanId=${source.id}`,
      )
      .set(...authorization(accessToken))
      .expect(200);
    expect(result.body).toMatchObject({
      data: [
        {
          id: matching.id,
          feedback: { shared: false, comment: 'Private experience' },
        },
      ],
      pagination: { total: 1 },
    });
    const foreign = await request(app.getHttpServer())
      .get(
        `/api/users/me/outings?status=completed&rated=true&sourcePlanId=${source.id}`,
      )
      .set(...authorization(otherAccessToken))
      .expect(200);
    expect(foreign.body).toMatchObject({ data: [], pagination: { total: 0 } });
    await request(app.getHttpServer())
      .get('/api/users/me/outings?sourcePlanId=0')
      .set(...authorization(accessToken))
      .expect(400);
  });

  it('reports the feedback lifecycle through the outing list and detail', async () => {
    // Just completed → the window is already open, no feedback yet.
    const plan = await createPlan('completed');

    const beforeList = await request(app.getHttpServer())
      .get('/api/users/me/outings')
      .set(...authorization(accessToken))
      .expect(200);
    expect(
      (beforeList.body as { data: Array<{ id: number }> }).data.find(
        (row) => row.id === plan.id,
      ),
    ).toMatchObject({ feedbackState: 'available', feedback: null });

    await request(app.getHttpServer())
      .post(`/api/plans/${plan.id}/feedback`)
      .set(...authorization(accessToken))
      .send({ rating: 4, tags: ['would_recommend'], actualCost: 1500 })
      .expect(201);

    const afterDetail = await request(app.getHttpServer())
      .get(`/api/users/me/outings/${plan.id}`)
      .set(...authorization(accessToken))
      .expect(200);
    expect(afterDetail.body).toMatchObject({
      feedbackState: 'submitted',
      feedback: { rating: 4, tags: ['would_recommend'], actualCost: 1500 },
    });
  });

  it('never exposes an outing or its feedback to another user', async () => {
    const plan = await createPlan('completed');
    await request(app.getHttpServer())
      .post(`/api/plans/${plan.id}/feedback`)
      .set(...authorization(accessToken))
      .send({ rating: 5 })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/plans/${plan.id}`)
      .set(...authorization(otherAccessToken))
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/users/me/outings/${plan.id}`)
      .set(...authorization(otherAccessToken))
      .expect(404);
  });

  it('rejects feedback for an outing that is not completed yet', async () => {
    const plan = await createPlan('confirmed');

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
