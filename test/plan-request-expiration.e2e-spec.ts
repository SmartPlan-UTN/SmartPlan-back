import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './create-test-app';
import { seedInitialData } from '../src/database/seeds/seed';
import {
  PlanRequest,
  PlanRequestMode,
} from '../src/recommendation/entities/plan-request.entity';
import { RequestStatus } from '../src/recommendation/entities/request-status.entity';
import { PlanRequestExpirationService } from '../src/recommendation/plan-request-expiration.service';

describe('Plan request deadline without a worker (real PostgreSQL)', () => {
  let app: INestApplication<App>;
  let db: DataSource;
  let expiration: PlanRequestExpirationService;
  let userId: number;
  let token: string;
  let statuses: Record<string, number>;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(DataSource);
    expiration = app.get(PlanRequestExpirationService);
    await seedInitialData(db);
    statuses = Object.fromEntries(
      (await db.getRepository(RequestStatus).find()).map((s) => [s.key, s.id]),
    );
    const response = await request(app.getHttpServer())
      .post('/api/users')
      .send({
        name: 'Deadline',
        lastName: 'Test',
        email: `deadline-${Date.now()}@example.com`,
        password: 'Deadline-test-password1!',
      })
      .expect(201);
    const body = response.body as { accessToken: string; user: { id: number } };
    userId = body.user.id;
    token = body.accessToken;
  });
  afterAll(async () => {
    await app?.close();
  });

  async function create(key: string, ageMs: number) {
    return db.getRepository(PlanRequest).save(
      db.getRepository(PlanRequest).create({
        idUser: userId,
        mode: PlanRequestMode.Automatic,
        requestedAt: new Date(Date.now() - ageMs),
        idRequestStatus: statuses[key],
        progressStage: key === 'pending' ? 'queued' : 'composing',
      }),
    );
  }

  it.each(['pending', 'processing'])(
    'expires %s through the API with no worker running',
    async (key) => {
      const row = await create(key, 31000);
      const response = await request(app.getHttpServer())
        .get(`/api/plan-requests/${row.id}`)
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(response.body).toMatchObject({
        statusKey: 'failed',
        failureCode: 'GENERATION_TIMEOUT',
      });
    },
  );

  it('sweeps expired rows while preserving fresh and terminal requests', async () => {
    const expired = await create('processing', 31000);
    const fresh = await create('pending', 0);
    const generated = await create('generated', 31000);
    await expiration.sweep();
    const repo = db.getRepository(PlanRequest);
    expect((await repo.findOneByOrFail({ id: expired.id })).failureCode).toBe(
      'GENERATION_TIMEOUT',
    );
    expect((await repo.findOneByOrFail({ id: fresh.id })).idRequestStatus).toBe(
      statuses.pending,
    );
    expect(
      (await repo.findOneByOrFail({ id: generated.id })).idRequestStatus,
    ).toBe(statuses.generated);
  });

  it('rechecks terminal state when expiration races a locked finalization', async () => {
    const row = await create('processing', 31000);
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.manager.query(
        'SELECT id FROM plan_request WHERE id = $1 FOR UPDATE',
        [row.id],
      );
      const sweep = expiration.expire(row.id);
      await runner.manager.update(PlanRequest, row.id, {
        idRequestStatus: statuses.generated,
      });
      await runner.commitTransaction();
      await sweep;
      const stored = await db
        .getRepository(PlanRequest)
        .findOneByOrFail({ id: row.id });
      expect(stored.idRequestStatus).toBe(statuses.generated);
      expect(stored.failureCode).toBeNull();
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
