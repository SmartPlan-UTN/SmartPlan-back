import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { seedInitialData } from '../src/database/seeds/seed';
import { Activity } from '../src/activities/entities/activity.entity';
import { ActivityPlace } from '../src/activities/entities/activity-place.entity';
import { PlanRequest } from '../src/recommendation/entities/plan-request.entity';
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
        password: 'secure-passphrase-for-smartplan',
      });
    accessToken = (registration.body as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await dataSource.getRepository(PlanRequest).deleteAll();
    await dataSource.getRepository(UserSession).deleteAll();
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

    it('rejects with 409 when no coordinates are provided', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/plan-requests/surprise')
        .set(...authorization())
        .send({})
        .expect(409);

      expect(response.body).toMatchObject({ code: 'NO_LOCATION_AVAILABLE' });
    });
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
          password: 'another-secure-passphrase',
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
