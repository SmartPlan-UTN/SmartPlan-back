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
import { TestNativeWorkerFactory } from './native-worker.factory';
import { NativeWorkerFactory } from '../src/messaging/native-worker/native-worker.factory';
import { NativeWorkerService } from '../src/messaging/native-worker/native-worker.service';
import { Country } from '../src/places/entities/country.entity';
import { City } from '../src/places/entities/city.entity';
import { Department } from '../src/places/entities/department.entity';
import { Place } from '../src/places/entities/place.entity';
import { Activity } from '../src/activities/entities/activity.entity';
import { ActivityPlace } from '../src/activities/entities/activity-place.entity';

jest.setTimeout(90000);

describe('Plan generation provider failure pipeline (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const workers = new TestNativeWorkerFactory('provider-failure');
  let accessToken: string;
  let userId: number;
  let departmentId: number;

  beforeAll(async () => {
    app = await createTestApp((module) =>
      module
        .overrideProvider(NativeWorkerService)
        .useClass(NativeWorkerService)
        .overrideProvider(NativeWorkerFactory)
        .useValue(workers),
    );
    dataSource = app.get(DataSource);
    await seedInitialData(dataSource);
    const country = await dataSource
      .getRepository(Country)
      .save({ name: 'Provider failure country' });
    const city = await dataSource
      .getRepository(City)
      .save({ name: 'Provider failure city', idCountry: country.id });
    const department = await dataSource
      .getRepository(Department)
      .save({ name: 'Provider failure department', idCity: city.id });
    departmentId = department.id;
    const place = await dataSource.getRepository(Place).save({
      name: 'Provider failure place',
      address: 'Fixture street',
      idDepartment: department.id,
      // A plannable venue: typed, published, positioned.
      kind: 'restaurant',
      status: 'published',
      discoverable: true,
      latitude: -32.89,
      longitude: -68.85,
    });
    const activity = await dataSource.getRepository(Activity).save({
      name: 'Provider failure activity',
      description: 'Fixture experience',
      estimatedCost: 1000,
      estimatedDuration: 60,
      type: 'meal',
      status: 'published',
      discoverable: true,
      planEligible: true,
    });
    await dataSource.getRepository(ActivityPlace).save({
      idPlace: place.id,
      idActivity: activity.id,
      latitude: -32.89,
      longitude: -68.85,
    });

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
  });

  afterAll(async () => {
    await dataSource.getRepository(PlanRequest).delete({ idUser: userId });
    await dataSource.getRepository(UserSession).delete({ idUser: userId });
    await dataSource.getRepository(AuditLog).deleteAll();
    await dataSource.getRepository(User).delete(userId);
    await app.close();
  });

  it('fails explicitly rather than dropping unresolved restrictions when the language provider is unavailable', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/plan-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        query: 'una cena sin carne',
        context: { idDepartment: departmentId },
      })
      .expect(202);
    const planRequestId = (created.body as { id: number }).id;
    const initial = await request(app.getHttpServer())
      .get(`/api/plan-requests/${planRequestId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
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
        workers.releaseFailure();
      }
      if (['generated', 'failed'].includes(finalStatus.statusKey)) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    } while (Date.now() <= deadline);

    console.log(
      JSON.stringify({
        requestId: planRequestId,
        finalStatus: finalStatus.statusKey,
        failureCode: finalStatus.failureCode,
      }),
    );
    expect(finalStatus.statusKey).toBe('failed');
    expect(sawProcessing).toBe(true);
    expect(finalStatus.failureCode).toBe('GENERATION_PROVIDER_UNAVAILABLE');
  });
});
