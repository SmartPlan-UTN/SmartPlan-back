import { AuditLog } from '../src/administration/entities/audit-log.entity';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { seedInitialData } from '../src/database/seeds/seed';
import { Activity } from '../src/activities/entities/activity.entity';
import { ActivityPlace } from '../src/activities/entities/activity-place.entity';
import { Plan } from '../src/plans/entities/plan.entity';
import { PlanStatus } from '../src/plans/entities/plan-status.entity';
import {
  PlanRequest,
  PlanRequestMode,
} from '../src/recommendation/entities/plan-request.entity';
import { RequestStatus } from '../src/recommendation/entities/request-status.entity';
import { UserSession } from '../src/auth/entities/user-session.entity';
import { User } from '../src/users/entities/user.entity';
import { City } from '../src/places/entities/city.entity';
import { Country } from '../src/places/entities/country.entity';
import { Department } from '../src/places/entities/department.entity';
import { Place } from '../src/places/entities/place.entity';
import { createTestApp } from './create-test-app';

describe('Plan requests API (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let accessToken: string;
  let userId: number;
  let departmentId: number;
  let countryId: number;
  let cityId: number;
  let placeId: number;
  let activityId: number;
  let activityPlaceId: number;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await seedInitialData(dataSource);

    const country = await dataSource
      .getRepository(Country)
      .save(
        dataSource
          .getRepository(Country)
          .create({ name: 'Argentina', description: null }),
      );
    countryId = country.id;
    const city = await dataSource.getRepository(City).save(
      dataSource.getRepository(City).create({
        idCountry: country.id,
        name: 'Mendoza',
        description: null,
      }),
    );
    cityId = city.id;
    const department = await dataSource.getRepository(Department).save(
      dataSource.getRepository(Department).create({
        idCity: city.id,
        name: 'Godoy Cruz',
        description: null,
      }),
    );
    departmentId = department.id;
    const place = await dataSource.getRepository(Place).save(
      dataSource.getRepository(Place).create({
        idDepartment: department.id,
        name: 'Central Winery',
        description: null,
        address: '123 Main Street',
      }),
    );
    placeId = place.id;
    const activity = await dataSource.getRepository(Activity).save(
      dataSource.getRepository(Activity).create({
        name: 'Wine tasting',
        description: 'A guided wine tasting',
        estimatedCost: 15000,
        estimatedDuration: 90,
      }),
    );
    activityId = activity.id;
    const activityPlace = await dataSource.getRepository(ActivityPlace).save(
      dataSource.getRepository(ActivityPlace).create({
        idActivity: activity.id,
        idPlace: place.id,
        latitude: -32.9264,
        longitude: -68.8464,
      }),
    );
    activityPlaceId = activityPlace.id;

    const registration = await request(app.getHttpServer())
      .post('/api/users')
      .send({
        name: 'Lucía',
        lastName: 'Gómez',
        email: 'lucia@example.com',
        password: 'Secure-passphrase-for-smartplan1!',
      });
    const registered = registration.body as {
      accessToken: string;
      user: { id: number };
    };
    accessToken = registered.accessToken;
    userId = registered.user.id;
  });

  afterAll(async () => {
    await dataSource.getRepository(Plan).delete({ idUser: userId });
    await dataSource.getRepository(PlanRequest).deleteAll();
    await dataSource.getRepository(UserSession).deleteAll();
    await dataSource.getRepository(AuditLog).deleteAll();
    await dataSource.getRepository(User).deleteAll();
    await dataSource.getRepository(ActivityPlace).delete(activityPlaceId);
    await dataSource.getRepository(Activity).delete(activityId);
    await dataSource.getRepository(Place).delete(placeId);
    await dataSource.getRepository(Department).delete(departmentId);
    await dataSource.getRepository(City).delete(cityId);
    await dataSource.getRepository(Country).delete(countryId);
    await app.close();
  });

  afterEach(async () => {
    await dataSource.getRepository(Plan).delete({ idUser: userId });
    await dataSource.getRepository(PlanRequest).deleteAll();
  });

  function authorization(): [string, string] {
    return ['Authorization', `Bearer ${accessToken}`];
  }

  describe('POST /api/plan-requests (CU17)', () => {
    it('accepts a valid request and returns it as pending', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/plan-requests')
        .set(...authorization())
        .send({ query: 'quiero cenar algo tranquilo con mi pareja' })
        .expect(202);

      expect(response.body).toMatchObject({
        statusKey: 'pending',
        mode: 'automatic',
      });
      expect(typeof (response.body as { id: number }).id).toBe('number');
    });

    it('rejects a query shorter than the minimum length', async () => {
      await request(app.getHttpServer())
        .post('/api/plan-requests')
        .set(...authorization())
        .send({ query: 'hi' })
        .expect(400);
    });

    it('rejects the request without authentication', async () => {
      await request(app.getHttpServer())
        .post('/api/plan-requests')
        .send({ query: 'quiero cenar algo tranquilo' })
        .expect(401);
    });

    it('rejects a new request once the active limit is reached', async () => {
      for (let i = 0; i < 3; i += 1) {
        await request(app.getHttpServer())
          .post('/api/plan-requests')
          .set(...authorization())
          .send({ query: `plan número ${i}` })
          .expect(202);
      }

      await request(app.getHttpServer())
        .post('/api/plan-requests')
        .set(...authorization())
        .send({ query: 'un plan más' })
        .expect(429);
    });
  });

  describe('POST /api/plan-requests/surprise (CU19)', () => {
    it('resolves the nearest department from GPS and accepts the request', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/plan-requests/surprise')
        .set(...authorization())
        .send({ latitude: -32.9264, longitude: -68.8464 })
        .expect(202);

      expect(response.body).toMatchObject({
        statusKey: 'pending',
        mode: 'surprise',
      });
    });

    it('still accepts the request when no coordinates are provided (falls back to a default department)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/plan-requests/surprise')
        .set(...authorization())
        .send({})
        .expect(202);

      expect(response.body).toMatchObject({
        statusKey: 'pending',
        mode: 'surprise',
      });
    });
  });

  describe('GET /api/plan-requests (#136)', () => {
    async function storedRequest(
      statusKey: string,
      requestedAt: string,
      owner = userId,
      rawQuery: string | null = `search ${requestedAt}`,
    ): Promise<PlanRequest> {
      const status = await dataSource
        .getRepository(RequestStatus)
        .findOneByOrFail({ key: statusKey });
      return dataSource.getRepository(PlanRequest).save(
        dataSource.getRepository(PlanRequest).create({
          idUser: owner,
          mode: rawQuery ? PlanRequestMode.Automatic : PlanRequestMode.Surprise,
          rawQuery,
          requestedAt: new Date(requestedAt),
          idRequestStatus: status.id,
        }),
      );
    }

    async function storedPlans(
      planRequest: PlanRequest,
      titles: string[],
    ): Promise<Plan[]> {
      const planStatus = await dataSource
        .getRepository(PlanStatus)
        .findOneOrFail({ where: {} });
      return dataSource.getRepository(Plan).save(
        titles.map((title) =>
          dataSource.getRepository(Plan).create({
            title,
            idUser: planRequest.idUser,
            idPlanRequest: planRequest.id,
            idPlanStatus: planStatus.id,
          }),
        ),
      );
    }

    it('rejects the request without authentication', async () => {
      await request(app.getHttpServer()).get('/api/plan-requests').expect(401);
    });

    it("lists the caller's generated and in-flight requests, newest first, with their plans", async () => {
      const generated = await storedRequest(
        'generated',
        '2026-10-14T20:00:00.000Z',
      );
      // Fresh, so the API's deadline sweep does not expire it mid-test.
      const inFlightAt = new Date().toISOString();
      const inFlight = await storedRequest(
        'processing',
        inFlightAt,
        userId,
        null,
      );
      await storedRequest('failed', '2026-10-15T10:00:00.000Z');
      await storedPlans(generated, ['Cena con vista', 'Paseo y vino']);

      const response = await request(app.getHttpServer())
        .get('/api/plan-requests')
        .set(...authorization())
        .expect(200);

      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.body).toEqual({
        data: [
          {
            id: inFlight.id,
            statusKey: 'processing',
            mode: 'surprise',
            requestedAt: inFlightAt,
            query: null,
            planCount: 0,
            planTitles: [],
          },
          {
            id: generated.id,
            statusKey: 'generated',
            mode: 'automatic',
            requestedAt: '2026-10-14T20:00:00.000Z',
            query: 'search 2026-10-14T20:00:00.000Z',
            planCount: 2,
            planTitles: ['Cena con vista', 'Paseo y vino'],
          },
        ],
        pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
      });
    });

    it("never includes another user's requests", async () => {
      const otherRegistration = await request(app.getHttpServer())
        .post('/api/users')
        .send({
          name: 'Ana',
          lastName: 'Ruiz',
          email: 'ana-list@example.com',
          password: 'Another-secure-passphrase2!',
        });
      const otherUserId = (otherRegistration.body as { user: { id: number } })
        .user.id;
      await storedRequest('generated', '2026-10-15T11:00:00.000Z', otherUserId);

      const response = await request(app.getHttpServer())
        .get('/api/plan-requests')
        .set(...authorization())
        .expect(200);

      expect(response.body).toMatchObject({
        data: [],
        pagination: { total: 0 },
      });
    });

    it('paginates', async () => {
      for (const day of [11, 12, 13])
        await storedPlans(
          await storedRequest('generated', `2026-10-${day}T12:00:00.000Z`),
          [`Plan ${day}`],
        );

      const response = await request(app.getHttpServer())
        .get('/api/plan-requests?page=2&limit=2')
        .set(...authorization())
        .expect(200);

      const body = response.body as {
        data: { requestedAt: string }[];
        pagination: unknown;
      };
      expect(body.data.map(({ requestedAt }) => requestedAt)).toEqual([
        '2026-10-11T12:00:00.000Z',
      ]);
      expect(body.pagination).toEqual({
        page: 2,
        limit: 2,
        total: 3,
        totalPages: 2,
      });
    });

    it('skips generated requests whose plans are all gone', async () => {
      await storedRequest('generated', '2026-10-12T12:00:00.000Z');
      const [plan] = await storedPlans(
        await storedRequest('generated', '2026-10-13T12:00:00.000Z'),
        ['Plan borrado'],
      );
      await dataSource.getRepository(Plan).softDelete(plan.id);

      const response = await request(app.getHttpServer())
        .get('/api/plan-requests')
        .set(...authorization())
        .expect(200);

      expect(response.body).toMatchObject({
        data: [],
        pagination: { total: 0 },
      });
    });

    it.each(['limit=101', 'sortBy=title', 'status=failed'])(
      'rejects an invalid query (%s)',
      async (queryString) => {
        await request(app.getHttpServer())
          .get(`/api/plan-requests?${queryString}`)
          .set(...authorization())
          .expect(400);
      },
    );
  });

  describe('GET /api/plan-requests/:id', () => {
    it('returns the status to the owner', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/plan-requests')
        .set(...authorization())
        .send({ query: 'un plan para el fin de semana' })
        .expect(202);
      const id = (created.body as { id: number }).id;

      const response = await request(app.getHttpServer())
        .get(`/api/plan-requests/${id}`)
        .set(...authorization())
        .expect(200);

      expect(response.body).toMatchObject({ id, statusKey: 'pending' });
    });

    it('returns 404 for a non-existent plan request', async () => {
      await request(app.getHttpServer())
        .get('/api/plan-requests/999999')
        .set(...authorization())
        .expect(404);
    });

    it("returns 403 when accessing another user's plan request", async () => {
      const created = await request(app.getHttpServer())
        .post('/api/plan-requests')
        .set(...authorization())
        .send({ query: 'un plan solo para mí' })
        .expect(202);
      const id = (created.body as { id: number }).id;

      const otherRegistration = await request(app.getHttpServer())
        .post('/api/users')
        .send({
          name: 'Marco',
          lastName: 'Díaz',
          email: 'marco@example.com',
          password: 'Another-secure-passphrase1!',
        });
      const otherAccessToken = (
        otherRegistration.body as { accessToken: string }
      ).accessToken;

      await request(app.getHttpServer())
        .get(`/api/plan-requests/${id}`)
        .set('Authorization', `Bearer ${otherAccessToken}`)
        .expect(403);
    });
  });
});
