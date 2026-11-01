import { Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import {
  EmailDeliveryError,
  EmailService,
  EmailDeliveryResult,
  EmailMessage,
} from '../src/auth/email/email.service';
import {
  EmailTransport,
  validateEnvironment,
} from '../src/config/environment-variables';
import { DatabaseModule } from '../src/database/database.module';
import { ADMIN_ROLE, USER_ROLE } from '../src/database/seeds/definitions';
import { seedInitialData } from '../src/database/seeds/seed';
import { PlanKind } from '../src/plans/entities/plan.entity';
import {
  EmailReminder,
  ReminderEmailStatus,
  ReminderKind,
} from '../src/reminders/entities/email-reminder.entity';
import { ReminderEmailService } from '../src/reminders/reminder-email.service';

/**
 * Reminder emails against real Postgres (#127): eligibility, deduplication
 * under concurrency, stale reminders and provider failures. The provider is
 * replaced; reception in a real inbox is a manual check (see
 * docs/reminder-emails.md).
 */
describe('ReminderEmailService (real Postgres, #127)', () => {
  let module: TestingModule;
  let dataSource: DataSource;
  let service: ReminderEmailService;
  const send = jest.fn<Promise<EmailDeliveryResult>, [EmailMessage]>();
  let sequence = 0;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env',
          validate: validateEnvironment,
        }),
        DatabaseModule,
      ],
      providers: [
        ReminderEmailService,
        { provide: EmailService, useValue: { send } },
      ],
    }).compile();

    dataSource = module.get(DataSource);
    service = module.get(ReminderEmailService);
    await seedInitialData(dataSource);
  });

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    send.mockReset();
    send.mockResolvedValue({
      transport: EmailTransport.Resend,
      providerMessageId: 'provider-msg-1',
    });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await dataSource.query('DELETE FROM email_reminder');
    await dataSource.query('DELETE FROM feedback');
    await dataSource.query('DELETE FROM plan');
    await dataSource.query(
      `DELETE FROM "user" WHERE email LIKE 'reminder-e2e-%'`,
    );
  });

  afterAll(async () => {
    await module.close();
  });

  async function catalogId(table: string, key: string): Promise<number> {
    const rows: { id: number }[] = await dataSource.query(
      `SELECT id FROM ${table} WHERE key = $1`,
      [key],
    );
    if (!rows[0]) throw new Error(`Missing ${table} seed value "${key}"`);
    return rows[0].id;
  }

  async function createUser(
    options: {
      daysOld?: number;
      role?: string;
      status?: string;
      remindersEnabled?: boolean;
    } = {},
  ): Promise<number> {
    sequence += 1;
    const rows: { id: number }[] = await dataSource.query(
      `INSERT INTO "user" (name, last_name, email, password_hash, id_role,
                           id_user_status, email_reminders_enabled, created_at)
       VALUES ('Ana', 'Reminder', $1, 'not-used', $2, $3, $4,
               now() - make_interval(days => $5))
       RETURNING id`,
      [
        `reminder-e2e-${Date.now()}-${sequence}@example.com`,
        await catalogId('role', options.role ?? USER_ROLE),
        await catalogId('user_status', options.status ?? 'active'),
        options.remindersEnabled ?? true,
        options.daysOld ?? 0,
      ],
    );
    return rows[0].id;
  }

  async function createPlan(
    userId: number,
    options: { kind?: PlanKind; completedHoursAgo?: number; daysOld?: number },
  ): Promise<number> {
    const rows: { id: number }[] = await dataSource.query(
      `INSERT INTO plan (title, description, id_user, kind, id_plan_status,
                         estimated_total_duration, completed_at, created_at)
       VALUES ('Bodegas en Luján', 'desc', $1, $2, $3, 60,
               CASE WHEN $4::int IS NULL THEN NULL
                    ELSE now() - make_interval(hours => $4::int) END,
               now() - make_interval(days => $5))
       RETURNING id`,
      [
        userId,
        options.kind ?? PlanKind.Outing,
        await catalogId(
          'plan_status',
          options.completedHoursAgo === undefined ? 'generated' : 'completed',
        ),
        options.completedHoursAgo ?? null,
        options.daysOld ?? 0,
      ],
    );
    return rows[0].id;
  }

  async function addFeedback(planId: number): Promise<void> {
    await dataSource.query(
      `INSERT INTO feedback (rating, id_plan, id_feedback_status)
       VALUES (5, $1, $2)`,
      [planId, await catalogId('feedback_status', 'pending')],
    );
  }

  function reminders(): Promise<EmailReminder[]> {
    return dataSource
      .getRepository(EmailReminder)
      .find({ order: { id: 'ASC' } });
  }

  describe('feedback reminders', () => {
    it('queues one reminder for an outing completed more than 24h ago without feedback', async () => {
      const userId = await createUser();
      const planId = await createPlan(userId, { completedHoursAgo: 25 });

      await expect(service.enqueueFeedbackReminders()).resolves.toBe(1);

      const [reminder] = await reminders();
      expect(reminder).toMatchObject({
        idUser: userId,
        idPlan: planId,
        kind: ReminderKind.Feedback,
        status: ReminderEmailStatus.Pending,
        dedupeKey: `feedback:${planId}`,
      });
    });

    it('queues nothing for an outing that already has feedback, is too recent, too old or not an outing', async () => {
      const userId = await createUser();
      await addFeedback(await createPlan(userId, { completedHoursAgo: 30 }));
      await createPlan(userId, { completedHoursAgo: 2 });
      await createPlan(userId, { completedHoursAgo: 24 * 20 });
      await createPlan(userId, {
        kind: PlanKind.Authored,
        completedHoursAgo: 30,
      });

      await expect(service.enqueueFeedbackReminders()).resolves.toBe(0);
    });

    it('never queues the same outing twice, even from concurrent ticks', async () => {
      const userId = await createUser();
      await createPlan(userId, { completedHoursAgo: 25 });

      await Promise.all([
        service.enqueueFeedbackReminders(),
        service.enqueueFeedbackReminders(),
        service.enqueueFeedbackReminders(),
      ]);
      await service.enqueueFeedbackReminders();

      expect(await reminders()).toHaveLength(1);
    });

    it('sends it with the link to the outing and records the provider id', async () => {
      const userId = await createUser();
      const planId = await createPlan(userId, { completedHoursAgo: 25 });
      await service.enqueueFeedbackReminders();

      const summary = await service.dispatchDue();

      expect(summary).toMatchObject({ claimed: 1, sent: 1 });
      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Recordá completar la retroalimentación de tu salida',
          idempotencyKey: `smartplan-reminder-feedback:${planId}`,
          text: expect.stringContaining(
            `http://localhost:3000/outings/${planId}`,
          ) as string,
        }),
      );
      const [reminder] = await reminders();
      expect(reminder.status).toBe(ReminderEmailStatus.Sent);
      expect(reminder.providerMessageId).toBe('provider-msg-1');
      expect(reminder.sentAt).not.toBeNull();
      expect(reminder.attempts).toBe(1);
    });

    it('cancels a queued reminder when the feedback arrives before it is sent', async () => {
      const userId = await createUser();
      const planId = await createPlan(userId, { completedHoursAgo: 25 });
      await service.enqueueFeedbackReminders();
      await addFeedback(planId);

      const summary = await service.dispatchDue();

      expect(summary).toMatchObject({ claimed: 1, cancelled: 1, sent: 0 });
      expect(send).not.toHaveBeenCalled();
      const [reminder] = await reminders();
      expect(reminder.status).toBe(ReminderEmailStatus.Cancelled);
      expect(reminder.cancelledReason).toBe('feedback_completed');
    });
  });

  describe('inactivity reminders', () => {
    it('queues an inactive account and not one with a recent plan', async () => {
      const inactive = await createUser({ daysOld: 40 });
      const active = await createUser({ daysOld: 40 });
      await createPlan(active, { kind: PlanKind.Authored, daysOld: 3 });

      await expect(service.enqueueInactivityReminders()).resolves.toBe(1);

      const [reminder] = await reminders();
      expect(reminder.idUser).toBe(inactive);
      expect(reminder.kind).toBe(ReminderKind.Inactivity);
    });

    it('counts a new account from its sign-up date', async () => {
      await createUser({ daysOld: 5 });

      await expect(service.enqueueInactivityReminders()).resolves.toBe(0);
    });

    it('skips administrators, suspended accounts and people who opted out', async () => {
      await createUser({ daysOld: 40, role: ADMIN_ROLE });
      await createUser({ daysOld: 40, status: 'suspended' });
      await createUser({ daysOld: 40, remindersEnabled: false });

      await expect(service.enqueueInactivityReminders()).resolves.toBe(0);
    });

    it('sends at most one email per inactive period', async () => {
      await createUser({ daysOld: 40 });

      await Promise.all([
        service.enqueueInactivityReminders(),
        service.enqueueInactivityReminders(),
      ]);
      await service.dispatchDue();
      await service.enqueueInactivityReminders();
      await service.dispatchDue();

      expect(await reminders()).toHaveLength(1);
      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Hace mucho que no armás un plan',
          text: expect.stringContaining(
            'http://localhost:3000/plans/create',
          ) as string,
        }),
      );
    });

    it('cancels the reminder when the person creates a plan before it is sent', async () => {
      const userId = await createUser({ daysOld: 40 });
      await service.enqueueInactivityReminders();
      await createPlan(userId, { kind: PlanKind.Authored });

      await service.dispatchDue();

      expect(send).not.toHaveBeenCalled();
      const [reminder] = await reminders();
      expect(reminder.status).toBe(ReminderEmailStatus.Cancelled);
      expect(reminder.cancelledReason).toBe('activity_resumed');
    });

    it('cancels the reminder when the person opts out before it is sent', async () => {
      const userId = await createUser({ daysOld: 40 });
      await service.enqueueInactivityReminders();
      await dataSource.query(
        `UPDATE "user" SET email_reminders_enabled = false WHERE id = $1`,
        [userId],
      );

      await service.dispatchDue();

      expect(send).not.toHaveBeenCalled();
      const [reminder] = await reminders();
      expect(reminder.cancelledReason).toBe('recipient_not_eligible');
    });
  });

  describe('delivery', () => {
    it.each([0, 4])(
      'recovers accepted mail after a database failure with %i previous attempts',
      async (previousAttempts) => {
        await queueOne();
        await dataSource.query('UPDATE email_reminder SET attempts = $1', [
          previousAttempts,
        ]);
        const originalQuery = dataSource.query.bind(dataSource) as (
          sql: string,
          parameters?: unknown[],
        ) => Promise<unknown>;
        const query = jest.spyOn(dataSource, 'query');
        let rejected = false;
        query.mockImplementation((sql: string, parameters?: unknown[]) => {
          if (
            !rejected &&
            sql.includes('SET status = $2') &&
            parameters?.[1] === 'sent'
          ) {
            rejected = true;
            return Promise.reject(
              new Error('temporary database connection failure'),
            );
          }
          return originalQuery(sql, parameters);
        });
        await service.dispatchDue();
        query.mockRestore();
        const [reminder] = await reminders();
        expect(send).toHaveBeenCalledTimes(1);
        expect(reminder.status).toBe(ReminderEmailStatus.Sending);
        await dataSource.query(
          "UPDATE email_reminder SET locked_until = now() - interval '1 minute'",
        );
        await service.dispatchDue();
        const [recovered] = await reminders();
        expect(recovered.status).toBe(ReminderEmailStatus.Sent);
        expect(recovered.providerMessageId).toBe('provider-msg-1');
        expect(send.mock.calls[1][0].idempotencyKey).toBe(
          send.mock.calls[0][0].idempotencyKey,
        );
      },
    );

    it('an expired dispatcher cannot overwrite a reclaimed send', async () => {
      await queueOne();
      await dataSource.query('UPDATE email_reminder SET attempts = 3');
      let rejectOld!: (reason: Error) => void;
      let resolveNew!: (value: EmailDeliveryResult) => void;
      let startedOld!: () => void;
      let startedNew!: () => void;
      const oldStarted = new Promise<void>((resolve) => {
        startedOld = resolve;
      });
      const newStarted = new Promise<void>((resolve) => {
        startedNew = resolve;
      });
      send.mockImplementationOnce(() => {
        startedOld();
        return new Promise<EmailDeliveryResult>((_, reject) => {
          rejectOld = reject;
        });
      });
      send.mockImplementationOnce(() => {
        startedNew();
        return new Promise<EmailDeliveryResult>((resolve) => {
          resolveNew = resolve;
        });
      });
      const oldDispatch = service.dispatchDue();
      await oldStarted;
      await dataSource.query(
        "UPDATE email_reminder SET locked_until = now() - interval '1 minute'",
      );
      const newDispatch = service.dispatchDue();
      await newStarted;
      rejectOld(new EmailDeliveryError('network timed out', true));
      await oldDispatch;
      const [duringNewDispatch] = await reminders();
      expect(duringNewDispatch.status).toBe(ReminderEmailStatus.Sending);
      expect(duringNewDispatch.attempts).toBe(5);
      resolveNew({
        transport: EmailTransport.Resend,
        providerMessageId: 'new-accepted',
      });
      await newDispatch;
      await dataSource.query(
        "UPDATE email_reminder SET next_attempt_at = now() - interval '1 minute'",
      );
      await service.dispatchDue();
      const [reminder] = await reminders();
      expect(reminder.status).toBe(ReminderEmailStatus.Sent);
      expect(reminder.providerMessageId).toBe('new-accepted');
    });

    async function queueOne(): Promise<void> {
      const userId = await createUser();
      await createPlan(userId, { completedHoursAgo: 25 });
      await service.enqueueFeedbackReminders();
    }

    it('reschedules a transient provider failure without marking it delivered', async () => {
      await queueOne();
      send.mockRejectedValue(
        new EmailDeliveryError('rate_limit_exceeded: slow down', true),
      );

      const summary = await service.dispatchDue();

      expect(summary).toMatchObject({ retried: 1, sent: 0 });
      const [reminder] = await reminders();
      expect(reminder.status).toBe(ReminderEmailStatus.Pending);
      expect(reminder.attempts).toBe(1);
      expect(reminder.sentAt).toBeNull();
      expect(reminder.lastError).toBe('rate_limit_exceeded: slow down');
      expect(reminder.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

      // Not due yet: the next tick leaves it alone.
      await expect(service.dispatchDue()).resolves.toMatchObject({
        claimed: 0,
      });
    });

    it('records a permanent provider failure as failed', async () => {
      await queueOne();
      send.mockRejectedValue(
        new EmailDeliveryError('validation_error: bad address', false),
      );

      await service.dispatchDue();

      const [reminder] = await reminders();
      expect(reminder.status).toBe(ReminderEmailStatus.Failed);
      expect(reminder.sentAt).toBeNull();
      expect(reminder.providerMessageId).toBeNull();
      expect(reminder.lastError).toBe('validation_error: bad address');
    });

    it('distinguishes the log transport from a real send', async () => {
      await queueOne();
      send.mockResolvedValue({ transport: EmailTransport.Log });

      await service.dispatchDue();

      const [reminder] = await reminders();
      expect(reminder.status).toBe(ReminderEmailStatus.Logged);
      expect(reminder.sentAt).toBeNull();
    });

    it('sends once when two dispatchers run at the same time', async () => {
      await queueOne();

      await Promise.all([service.dispatchDue(), service.dispatchDue()]);

      expect(send).toHaveBeenCalledTimes(1);
      const [reminder] = await reminders();
      expect(reminder.status).toBe(ReminderEmailStatus.Sent);
    });

    it('reclaims a reminder abandoned while sending', async () => {
      await queueOne();
      await dataSource.query(
        `UPDATE email_reminder
         SET status = 'sending', attempts = 1,
             locked_until = now() - interval '1 minute'`,
      );

      await service.dispatchDue();

      const [reminder] = await reminders();
      expect(reminder.status).toBe(ReminderEmailStatus.Sent);
      expect(reminder.attempts).toBe(2);
    });
  });
});
