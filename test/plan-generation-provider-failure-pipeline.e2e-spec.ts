import { Country } from '../src/places/entities/country.entity';
import { City } from '../src/places/entities/city.entity';
import { Department } from '../src/places/entities/department.entity';
import { Place } from '../src/places/entities/place.entity';
import { Activity } from '../src/activities/entities/activity.entity';
import { ActivityPlace } from '../src/activities/entities/activity-place.entity';
import { Plan } from '../src/plans/entities/plan.entity';
import { AuditLog } from '../src/administration/entities/audit-log.entity';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { seedInitialData } from '../src/database/seeds/seed';
import { PlanRequest } from '../src/recommendation/entities/plan-request.entity';
import { UserSession } from '../src/auth/entities/user-session.entity';
import { User } from '../src/users/entities/user.entity';
import { createTestApp } from './create-test-app';
import { spawnWorker, SpawnedWorker } from './spawn-worker';

jest.setTimeout(90000);

describe('Plan generation provider failure pipeline (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let worker: SpawnedWorker;
  let accessToken: string;
  let userId: number;
  let countryId: number;
  let cityId: number;
  let departmentId: number;
  let placeId: number;
  let activityId: number;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await seedInitialData(dataSource);

    const registration = await request(app.getHttpServer())
      .post('/api/users')
      .send({
        name: 'Provider Failure',
        lastName: 'Tester',
        email: `provider-failure-${Date.now()}@smartplan.test`,
        password: 'Secure-passphrase-for-smartplan1!',
      })
      .expect(201);
    accessToken = (registration.body as { accessToken: string }).accessToken;
    userId = (registration.body as { user: { id: number } }).user.id;
    const country = await dataSource
      .getRepository(Country)
      .save({ name: 'Fallback country' });
    countryId = country.id;
    const city = await dataSource
      .getRepository(City)
      .save({ name: 'Fallback city', idCountry: countryId });
    cityId = city.id;
    const department = await dataSource
      .getRepository(Department)
      .save({ name: 'Fallback department', idCity: cityId });
    departmentId = department.id;
    const place = await dataSource.getRepository(Place).save({
      name: 'Fallback park',
      address: 'Park entrance',
      idDepartment: departmentId,
    });
    placeId = place.id;
    const activity = await dataSource.getRepository(Activity).save({
      name: 'Paseo por el parque',
      description: 'Un paseo tranquilo',
      estimatedCost: 0,
      estimatedDuration: 30,
    });
    activityId = activity.id;
    await dataSource
      .getRepository(ActivityPlace)
      .save({ idActivity: activityId, idPlace: placeId });
    worker = await spawnWorker('provider-failure');
  });

  afterAll(async () => {
    await worker?.stop();
    await dataSource.getRepository(Plan).delete({ idUser: userId });
    await dataSource.getRepository(PlanRequest).delete({ idUser: userId });
    await dataSource
      .getRepository(ActivityPlace)
      .delete({ idActivity: activityId });
    await dataSource.getRepository(Activity).delete(activityId);
    await dataSource.getRepository(Place).delete(placeId);
    await dataSource.getRepository(Department).delete(departmentId);
    await dataSource.getRepository(City).delete(cityId);
    await dataSource.getRepository(Country).delete(countryId);
    await dataSource.getRepository(UserSession).delete({ idUser: userId });
    await dataSource.getRepository(AuditLog).delete({ idActor: userId });
    await dataSource.getRepository(User).delete(userId);
    await app.close();
  });

  it('delivers a real plan through HTTP and RabbitMQ when both Gemini calls fail (CU17)', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/plan-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        query: 'una salida tranquila',
        context: {
          idDepartment: departmentId,
          budget: 0,
          availableDuration: 60,
        },
      })
      .expect(202);
    const planRequestId = (created.body as { id: number }).id;
    const initial = await request(app.getHttpServer())
      .get(`/api/plan-requests/${planRequestId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    // The worker may claim the request before this first read.
    expect(['pending', 'processing']).toContain(
      (initial.body as { statusKey: string }).statusKey,
    );

    const deadline = Date.now() + 75000;
    let finalStatus: { statusKey: string; failureCode?: string };
    let sawProcessing = false;
    do {
      const response = await request(app.getHttpServer())
        .get(`/api/plan-requests/${planRequestId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      finalStatus = response.body as typeof finalStatus;
      if (!sawProcessing && finalStatus.statusKey === 'processing') {
        sawProcessing = true;
        worker.process.send?.('release-provider-failure');
      }
      if (['generated', 'failed'].includes(finalStatus.statusKey)) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    } while (Date.now() <= deadline);

    expect(finalStatus.statusKey).toBe('generated');
    expect(sawProcessing).toBe(true);
    const generated = await dataSource.getRepository(Plan).findOneOrFail({
      where: { idPlanRequest: planRequestId },
      relations: { details: true },
    });
    expect(generated.estimatedTotalCost).toBe(0);
    expect(generated.details.map((detail) => detail.idActivity)).toEqual([
      activityId,
    ]);
  });
});
