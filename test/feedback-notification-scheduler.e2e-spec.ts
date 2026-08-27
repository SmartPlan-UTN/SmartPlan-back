import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { validateWorkerEnvironment } from '../src/config/worker-environment-variables';
import { DatabaseModule } from '../src/database/database.module';
import { seedInitialData } from '../src/database/seeds/seed';
import { Notification } from '../src/administration/entities/notification.entity';
import { FeedbackNotificationScheduler } from '../src/messaging/worker/feedback-notification.scheduler';
import { Plan } from '../src/plans/entities/plan.entity';
import { User } from '../src/users/entities/user.entity';
import { USER_ROLE } from '../src/database/seeds/definitions';

describe('FeedbackNotificationScheduler (real Postgres, CU23)', () => {
  let module: TestingModule;
  let dataSource: DataSource;
  let scheduler: FeedbackNotificationScheduler;
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
        TypeOrmModule.forFeature([Notification, Plan, User]),
      ],
      providers: [FeedbackNotificationScheduler],
    }).compile();

    dataSource = module.get(DataSource);
    scheduler = module.get(FeedbackNotificationScheduler);
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
        name: 'Feedback',
        lastName: 'Scheduler',
        email: `feedback-scheduler-${Date.now()}@example.com`,
        passwordHash: 'hashed-value-not-used',
        idRole: role?.id,
        idUserStatus: userStatus?.id,
      }),
    );
    userId = user.id;
  });

  afterAll(async () => {
    await dataSource.getRepository(Notification).deleteAll();
    await dataSource.getRepository(Plan).deleteAll();
    await dataSource.getRepository(User).delete(userId);
    await module.close();
  });

  afterEach(async () => {
    await dataSource.getRepository(Notification).deleteAll();
    await dataSource.getRepository(Plan).deleteAll();
  });

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

  async function createCompletedPlan(hoursAgo: number): Promise<Plan> {
    const plans = dataSource.getRepository(Plan);
    const plan = await plans.save(
      plans.create({
        idUser: userId,
        idPlanStatus: await planStatusId('completed'),
        title: 'Scheduler test plan',
        description: 'desc',
        estimatedTotalCost: 1000,
        estimatedTotalDuration: 60,
        completedAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
      }),
    );
    return plan;
  }

  it('requests feedback for a plan completed more than 24h ago', async () => {
    const plan = await createCompletedPlan(25);

    await scheduler.requestPendingFeedback();

    const updated = await dataSource
      .getRepository(Plan)
      .findOneOrFail({ where: { id: plan.id } });
    expect(updated.feedbackRequestedAt).not.toBeNull();

    const notifications = await dataSource
      .getRepository(Notification)
      .find({ where: { resourceId: plan.id, resourceType: 'plan' } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].idUser).toBe(userId);
  });

  it('does not request feedback for a plan completed less than 24h ago', async () => {
    const plan = await createCompletedPlan(1);

    await scheduler.requestPendingFeedback();

    const updated = await dataSource
      .getRepository(Plan)
      .findOneOrFail({ where: { id: plan.id } });
    expect(updated.feedbackRequestedAt).toBeNull();
  });

  it('does not request feedback twice for the same plan', async () => {
    const plan = await createCompletedPlan(25);

    await scheduler.requestPendingFeedback();
    await scheduler.requestPendingFeedback();

    const notifications = await dataSource
      .getRepository(Notification)
      .find({ where: { resourceId: plan.id, resourceType: 'plan' } });
    expect(notifications).toHaveLength(1);
  });

  it('creates exactly one notification under two concurrent executions', async () => {
    const plan = await createCompletedPlan(25);

    await Promise.all([
      scheduler.requestPendingFeedback(),
      scheduler.requestPendingFeedback(),
    ]);

    const notifications = await dataSource
      .getRepository(Notification)
      .find({ where: { resourceId: plan.id, resourceType: 'plan' } });
    expect(notifications).toHaveLength(1);
  });

  it('a second UPDATE that races the first while its transaction is still open affects 0 rows', async () => {
    const plan = await createCompletedPlan(25);
    let releaseFirstTransaction: () => void = () => {};
    const firstTransactionCanCommit = new Promise<void>((resolve) => {
      releaseFirstTransaction = resolve;
    });

    const firstUpdate = dataSource.transaction(async (manager) => {
      const [rows]: [{ id: number }[], number] = await manager.query(
        `UPDATE plan SET feedback_requested_at = now()
         WHERE id = $1 AND feedback_requested_at IS NULL
         RETURNING id`,
        [plan.id],
      );
      await firstTransactionCanCommit;
      return rows;
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const secondUpdate = dataSource.transaction(async (manager) => {
      const [rows]: [{ id: number }[], number] = await manager.query(
        `UPDATE plan SET feedback_requested_at = now()
         WHERE id = $1 AND feedback_requested_at IS NULL
         RETURNING id`,
        [plan.id],
      );
      return rows;
    });

    releaseFirstTransaction();
    const [firstRows, secondRows] = await Promise.all([
      firstUpdate,
      secondUpdate,
    ]);

    expect(firstRows).toHaveLength(1);
    expect(secondRows).toHaveLength(0);
  });
});
