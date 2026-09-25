import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { seedInitialData } from '../src/database/seeds/seed';
import { Activity } from '../src/activities/entities/activity.entity';
import { ActivityCategory } from '../src/activities/entities/activity-category.entity';
import { ActivityPlace } from '../src/activities/entities/activity-place.entity';
import { Category } from '../src/categories/entities/category.entity';
import { City } from '../src/places/entities/city.entity';
import { Country } from '../src/places/entities/country.entity';
import { Department } from '../src/places/entities/department.entity';
import { Place } from '../src/places/entities/place.entity';
import { Plan } from '../src/plans/entities/plan.entity';
import { PlanRequest } from '../src/recommendation/entities/plan-request.entity';
import { UserSession } from '../src/auth/entities/user-session.entity';
import { User } from '../src/users/entities/user.entity';
import { createTestApp } from './create-test-app';
import { spawnWorker, SpawnedWorker } from './spawn-worker';

jest.setTimeout(90000);

describe('Full plan generation pipeline (e2e, real worker + RabbitMQ)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let worker: SpawnedWorker;
  let accessToken: string;
  let departmentId: number;
  let countryId: number;
  let cityId: number;
  let placeId: number;
  let activityId: number;
  let activityPlaceId: number;
  let activityCategoryId: number;

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

    const gastronomyCategory = await dataSource
      .getRepository(Category)
      .findOneOrFail({ where: { name: 'Gastronomy' } });
    const activityCategory = await dataSource
      .getRepository(ActivityCategory)
      .save(
        dataSource.getRepository(ActivityCategory).create({
          idActivity: activity.id,
          idCategory: gastronomyCategory.id,
        }),
      );
    activityCategoryId = activityCategory.id;

    const registration = await request(app.getHttpServer())
      .post('/api/users')
      .send({
        name: 'Pipeline',
        lastName: 'Tester',
        email: 'pipeline-tester@example.com',
        password: 'secure-passphrase-for-smartplan',
      });
    accessToken = (registration.body as { accessToken: string }).accessToken;

    worker = await spawnWorker();
  });

  afterAll(async () => {
    await worker.stop();
    await dataSource.getRepository(Plan).deleteAll();
    await dataSource.getRepository(PlanRequest).deleteAll();
    await dataSource.getRepository(UserSession).deleteAll();
    await dataSource.getRepository(User).deleteAll();
    await dataSource.getRepository(ActivityCategory).delete(activityCategoryId);
    await dataSource.getRepository(ActivityPlace).delete(activityPlaceId);
    await dataSource.getRepository(Activity).delete(activityId);
    await dataSource.getRepository(Place).delete(placeId);
    await dataSource.getRepository(Department).delete(departmentId);
    await dataSource.getRepository(City).delete(cityId);
    await dataSource.getRepository(Country).delete(countryId);
    await app.close();
  });

  function authorization(): [string, string] {
    return ['Authorization', `Bearer ${accessToken}`];
  }

  async function pollStatus(
    planRequestId: number,
    isTerminal: (statusKey: string) => boolean,
    timeoutMs = 75000,
  ): Promise<{ statusKey: string; [key: string]: unknown }> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const response = await request(app.getHttpServer())
        .get(`/api/plan-requests/${planRequestId}`)
        .set(...authorization())
        .expect(200);
      const body = response.body as { statusKey: string };
      if (isTerminal(body.statusKey)) return body;
      if (Date.now() > deadline) {
        throw new Error(
          `Timed out waiting for a terminal status, last seen: ${body.statusKey}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  it('generates a real plan end-to-end: HTTP create -> RabbitMQ -> real worker -> DB -> HTTP status', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/plan-requests')
      .set(...authorization())
      .send({
        query: 'quiero cenar algo tranquilo con mi pareja',
        context: { idDepartment: departmentId, budget: 30000 },
      })
      .expect(202);
    const planRequestId = (created.body as { id: number }).id;

    const finalStatus = await pollStatus(
      planRequestId,
      (statusKey) => statusKey === 'generated' || statusKey === 'failed',
    );

    expect(finalStatus.statusKey).toBe('generated');
    const plans = finalStatus.plans as { id: number }[] | undefined;
    expect(plans?.length).toBeGreaterThan(0);
  });

  it('fails permanently with MISSING_REQUIRED_CONTEXT when neither budget nor location can be resolved', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/plan-requests')
      .set(...authorization())
      .send({ query: 'algo divertido' })
      .expect(202);
    const planRequestId = (created.body as { id: number }).id;

    const finalStatus = await pollStatus(
      planRequestId,
      (statusKey) => statusKey === 'generated' || statusKey === 'failed',
    );

    expect(finalStatus.statusKey).toBe('failed');
    expect(finalStatus.failureCode).toBe('MISSING_REQUIRED_CONTEXT');
    const detail = finalStatus.failureDetail as { missingFields?: string[] };
    expect(detail.missingFields).toContain('budget');
    expect(detail.missingFields).toContain('location');
  });
});
