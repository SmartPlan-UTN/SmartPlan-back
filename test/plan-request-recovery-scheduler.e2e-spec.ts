import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { validateWorkerEnvironment } from '../src/config/worker-environment-variables';
import { DatabaseModule } from '../src/database/database.module';
import { MessagingModule } from '../src/messaging/messaging.module';
import { MessagingService } from '../src/messaging/messaging.service';
import { seedInitialData } from '../src/database/seeds/seed';
import { PlanRequestRecoveryScheduler } from '../src/messaging/worker/plan-request-recovery.scheduler';
import {
  PlanRequest,
  PlanRequestMode,
} from '../src/recommendation/entities/plan-request.entity';
import { User } from '../src/users/entities/user.entity';
import { USER_ROLE } from '../src/database/seeds/definitions';

describe('PlanRequestRecoveryScheduler (real Postgres + RabbitMQ)', () => {
  let module: TestingModule;
  let dataSource: DataSource;
  let scheduler: PlanRequestRecoveryScheduler;
  let messaging: MessagingService;
  let userId: number;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env',
          validate: validateWorkerEnvironment,
        }),
        DatabaseModule,
        TypeOrmModule.forFeature([PlanRequest, User]),
        MessagingModule.forRoot('worker'),
      ],
      providers: [PlanRequestRecoveryScheduler],
    }).compile();

    dataSource = module.get(DataSource);
    scheduler = module.get(PlanRequestRecoveryScheduler);
    messaging = module.get(MessagingService);
    await seedInitialData(dataSource);

    const role = await dataSource
      .createQueryBuilder()
      .select('role.id', 'id')
      .from('role', 'role')
      .where('role.key = :key', { key: USER_ROLE })
      .getRawOne<{ id: number }>();
    const userStatus = await dataSource
      .createQueryBuilder()
      .select('status.id', 'id')
      .from('user_status', 'status')
      .where('status.key = :key', { key: 'active' })
      .getRawOne<{ id: number }>();

    const user = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        name: 'Recovery',
        lastName: 'Sweep',
        email: `recovery-sweep-${Date.now()}@example.com`,
        passwordHash: 'hashed-value-not-used',
        idRole: role?.id,
        idUserStatus: userStatus?.id,
      }),
    );
    userId = user.id;
  });

  afterAll(async () => {
    await dataSource.getRepository(PlanRequest).deleteAll();
    await dataSource.getRepository(User).delete(userId);
    await module.close();
  });

  afterEach(async () => {
    await dataSource.getRepository(PlanRequest).deleteAll();
    jest.restoreAllMocks();
  });

  async function statusId(key: string): Promise<number> {
    const status = await dataSource
      .createQueryBuilder()
      .select('status.id', 'id')
      .from('request_status', 'status')
      .where('status.key = :key', { key })
      .getRawOne<{ id: number }>();
    if (!status) throw new Error(`Missing request_status seed value "${key}"`);
    return status.id;
  }

  async function createStaleProcessing(minutesAgo: number): Promise<number> {
    const planRequests = dataSource.getRepository(PlanRequest);
    const saved = await planRequests.save(
      planRequests.create({
        idUser: userId,
        mode: PlanRequestMode.Automatic,
        rawQuery: 'algo',
        idRequestStatus: await statusId('processing'),
        requestedAt: new Date(),
        processingStartedAt: new Date(Date.now() - minutesAgo * 60 * 1000),
      }),
    );
    return saved.id;
  }

  async function createOrphanPending(minutesAgo: number): Promise<number> {
    const planRequests = dataSource.getRepository(PlanRequest);
    const saved = await planRequests.save(
      planRequests.create({
        idUser: userId,
        mode: PlanRequestMode.Automatic,
        rawQuery: 'algo',
        idRequestStatus: await statusId('pending'),
        requestedAt: new Date(),
      }),
    );
    await dataSource
      .createQueryBuilder()
      .update(PlanRequest)
      .set({ createdAt: () => `now() - interval '${minutesAgo} minutes'` })
      .where('id = :id', { id: saved.id })
      .execute();
    return saved.id;
  }

  it('republishes a stale processing request and increments recoveryAttempts', async () => {
    const publishSpy = jest.spyOn(messaging, 'publish');
    const id = await createStaleProcessing(20);

    await scheduler.recoverStuckRequests();

    expect(publishSpy).toHaveBeenCalled();
    const updated = await dataSource
      .getRepository(PlanRequest)
      .findOneOrFail({ where: { id } });
    expect(updated.recoveryAttempts).toBe(1);
  });

  it('republishes an orphaned pending request', async () => {
    const publishSpy = jest.spyOn(messaging, 'publish');
    const id = await createOrphanPending(10);

    await scheduler.recoverStuckRequests();

    expect(publishSpy).toHaveBeenCalled();
    const updated = await dataSource
      .getRepository(PlanRequest)
      .findOneOrFail({ where: { id } });
    expect(updated.recoveryAttempts).toBe(1);
  });

  it('does not touch a processing request that is not yet stale', async () => {
    const id = await createStaleProcessing(2);

    await scheduler.recoverStuckRequests();

    const updated = await dataSource
      .getRepository(PlanRequest)
      .findOneOrFail({ where: { id } });
    expect(updated.recoveryAttempts).toBe(0);
  });

  it('marks a request permanently failed after exhausting recovery attempts', async () => {
    const id = await createStaleProcessing(20);
    await dataSource
      .getRepository(PlanRequest)
      .update(id, { recoveryAttempts: 3 });

    await scheduler.recoverStuckRequests();

    const updated = await dataSource
      .getRepository(PlanRequest)
      .findOneOrFail({ where: { id }, relations: { status: true } });
    expect(updated.status.key).toBe('failed');
    expect(updated.failureCode).toBe('GENERATION_UNAVAILABLE');
  });

  it('increments recoveryAttempts by exactly one under two concurrent sweep executions', async () => {
    const id = await createStaleProcessing(20);

    await Promise.all([
      scheduler.recoverStuckRequests(),
      scheduler.recoverStuckRequests(),
    ]);

    const updated = await dataSource
      .getRepository(PlanRequest)
      .findOneOrFail({ where: { id } });
    expect(updated.recoveryAttempts).toBe(1);
  });

  it('a second claim UPDATE that races the first while its transaction is still open affects 0 rows', async () => {
    const id = await createStaleProcessing(20);
    let releaseFirstTransaction: () => void = () => {};
    const firstTransactionCanCommit = new Promise<void>((resolve) => {
      releaseFirstTransaction = resolve;
    });

    const firstClaim = dataSource.transaction(async (manager) => {
      const [rows]: [{ recovery_attempts: number }[], number] =
        await manager.query(
          `UPDATE plan_request
           SET recovery_attempts = recovery_attempts + 1,
               recovery_claimed_at = now()
           WHERE id = $1
             AND processing_started_at < now() - interval '15 minutes'
             AND (recovery_claimed_at IS NULL
                  OR recovery_claimed_at < now() - interval '15 minutes')
           RETURNING recovery_attempts`,
          [id],
        );
      await firstTransactionCanCommit;
      return rows;
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const secondClaim = dataSource.transaction(async (manager) => {
      const [rows]: [{ recovery_attempts: number }[], number] =
        await manager.query(
          `UPDATE plan_request
           SET recovery_attempts = recovery_attempts + 1,
               recovery_claimed_at = now()
           WHERE id = $1
             AND processing_started_at < now() - interval '15 minutes'
             AND (recovery_claimed_at IS NULL
                  OR recovery_claimed_at < now() - interval '15 minutes')
           RETURNING recovery_attempts`,
          [id],
        );
      return rows;
    });

    releaseFirstTransaction();
    const [firstRows, secondRows] = await Promise.all([
      firstClaim,
      secondClaim,
    ]);

    expect(firstRows).toHaveLength(1);
    expect(secondRows).toHaveLength(0);
  });
});
