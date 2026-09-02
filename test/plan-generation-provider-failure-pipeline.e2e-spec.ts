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
        password: 'secure-passphrase-for-smartplan',
      })
      .expect(201);
    accessToken = (registration.body as { accessToken: string }).accessToken;
    userId = (registration.body as { user: { id: number } }).user.id;
    worker = await spawnWorker('provider-failure');
  });

  afterAll(async () => {
    await worker.stop();
    await dataSource.getRepository(PlanRequest).delete({ idUser: userId });
    await dataSource.getRepository(UserSession).delete({ idUser: userId });
    await dataSource.getRepository(User).delete(userId);
    await app.close();
  });

  it('persists processing -> failed with a terminal provider error', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/plan-requests')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ query: 'una salida tranquila' })
      .expect(202);
    const planRequestId = (created.body as { id: number }).id;
    const initial = await request(app.getHttpServer())
      .get(`/api/plan-requests/${planRequestId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect((initial.body as { statusKey: string }).statusKey).toBe('pending');

    const deadline = Date.now() + 75000;
    let finalStatus: { statusKey: string; failureCode?: string };
    let sawProcessing = false;
    do {
      const response = await request(app.getHttpServer())
        .get(`/api/plan-requests/${planRequestId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      finalStatus = response.body as typeof finalStatus;
      sawProcessing ||= finalStatus.statusKey === 'processing';
      if (finalStatus.statusKey === 'failed') break;
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
