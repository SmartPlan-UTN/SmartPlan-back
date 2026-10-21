import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { EmailService, EmailDeliveryResult } from '../auth/email/email.service';
import {
  EmailTransport,
  EnvironmentVariables,
} from '../config/environment-variables';
import { USER_ROLE } from '../database/seeds/definitions';
import { COMPLETED_THRESHOLD_HOURS } from '../messaging/worker/feedback-notification.scheduler';
import {
  ReminderEmailStatus,
  ReminderKind,
} from './entities/email-reminder.entity';
import { decideAfterFailure, SENDING_LOCK_MINUTES } from './reminder-delivery';
import {
  feedbackReminderEmail,
  inactivityReminderEmail,
  RenderedEmail,
} from './reminder-email-templates';

/**
 * Who may receive a reminder at all: an active, not deleted account that
 * has not opted out. Expects the user aliased as `u`.
 */
const RECIPIENT_ELIGIBLE_SQL = `(
  u.deleted_at IS NULL
  AND u.email_reminders_enabled
  AND EXISTS (
    SELECT 1 FROM user_status s
    WHERE s.id = u.id_user_status AND s.key = 'active'
  )
)`;

/**
 * The last time the person "built a plan": created any plan (authored,
 * generated or an outing) or asked for one to be generated. A new account
 * counts from its sign-up, so it is reminded once it has gone the whole
 * inactivity period without its first plan. Expects the user aliased `u`.
 */
const LAST_ACTIVITY_SQL = `GREATEST(
  u.created_at,
  COALESCE((SELECT max(p.created_at) FROM plan p WHERE p.id_user = u.id), u.created_at),
  COALESCE((SELECT max(pr.created_at) FROM plan_request pr WHERE pr.id_user = u.id), u.created_at)
)`;

/** An outing still waiting for feedback. Expects the plan aliased as `p`. */
const FEEDBACK_PENDING_SQL = `(
  p.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM feedback f
    WHERE f.id_plan = p.id AND f.deleted_at IS NULL
  )
)`;

interface ReminderClaim {
  id: number;
  attempts: number;
  recovered: boolean;
}

interface ClaimedReminder extends Omit<ReminderClaim, 'recovered'> {
  kind: ReminderKind;
  dedupe_key: string;
  created_at: Date;
  id_plan: number | null;
  email: string;
  name: string;
  recipient_eligible: boolean;
  plan_title: string | null;
  feedback_pending: boolean | null;
  last_activity_at: Date;
}

export interface DispatchSummary {
  claimed: number;
  sent: number;
  logged: number;
  retried: number;
  failed: number;
  cancelled: number;
}

/**
 * Reminder emails (#127): enqueues one outbox row per reminder event and
 * delivers due rows through `EmailService`.
 *
 * Every step is safe to run concurrently (overlapping ticks, several API
 * replicas): enqueueing relies on the unique `dedupe_key`, claiming on
 * `FOR UPDATE SKIP LOCKED`, and each final state change only applies to a
 * row still `sending` with the same attempt number. The dedupe key also
 * travels as the provider idempotency key, so a send retried after a crash
 * is not a second email.
 */
@Injectable()
export class ReminderEmailService {
  private readonly logger = new Logger(ReminderEmailService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly emailService: EmailService,
    private readonly configuration: ConfigService<EnvironmentVariables, true>,
  ) {}

  /**
   * Outings completed at least 24h ago (the in-app reminder's rule) with no
   * feedback yet. Outings older than `REMINDER_FEEDBACK_MAX_AGE_DAYS` are
   * left alone so enabling this never mails about long-forgotten outings.
   */
  async enqueueFeedbackReminders(): Promise<number> {
    // INSERT ... RETURNING resolves to the rows themselves (UPDATE: [rows, count]).
    const rows: { id: number }[] = await this.dataSource.query(
      `INSERT INTO email_reminder (id_user, kind, dedupe_key, id_plan)
       SELECT p.id_user, '${ReminderKind.Feedback}', 'feedback:' || p.id, p.id
       FROM plan p
       JOIN "user" u ON u.id = p.id_user
       WHERE p.kind = 'outing'
         AND p.completed_at IS NOT NULL
         AND p.completed_at <= now() - make_interval(hours => $1)
         AND p.completed_at > now() - make_interval(days => $2)
         AND ${FEEDBACK_PENDING_SQL}
         AND ${RECIPIENT_ELIGIBLE_SQL}
       ON CONFLICT (dedupe_key) WHERE deleted_at IS NULL DO NOTHING
       RETURNING id`,
      [
        COMPLETED_THRESHOLD_HOURS,
        this.configuration.get('REMINDER_FEEDBACK_MAX_AGE_DAYS', {
          infer: true,
        }),
      ],
    );
    return rows.length;
  }

  /**
   * People (role `user`) whose last activity is older than
   * `REMINDER_INACTIVITY_DAYS`. The key includes that last activity, so one
   * period of inactivity produces at most one email however long it lasts;
   * a new email needs new activity followed by a new inactive period, and
   * never comes sooner than `REMINDER_INACTIVITY_MIN_INTERVAL_DAYS` after
   * the previous one.
   */
  async enqueueInactivityReminders(): Promise<number> {
    const rows: { id: number }[] = await this.dataSource.query(
      `INSERT INTO email_reminder (id_user, kind, dedupe_key)
       SELECT a.id, '${ReminderKind.Inactivity}',
              'inactivity:' || a.id || ':' || floor(extract(epoch FROM a.last_activity_at))::bigint
       FROM (
         SELECT u.id, ${LAST_ACTIVITY_SQL} AS last_activity_at
         FROM "user" u
         JOIN role r ON r.id = u.id_role
         WHERE r.key = $3 AND ${RECIPIENT_ELIGIBLE_SQL}
       ) a
       WHERE a.last_activity_at <= now() - make_interval(days => $1)
         AND NOT EXISTS (
           SELECT 1 FROM email_reminder previous
           WHERE previous.id_user = a.id
             AND previous.deleted_at IS NULL
             AND previous.kind = '${ReminderKind.Inactivity}'
             AND previous.status <> '${ReminderEmailStatus.Cancelled}'
             AND previous.created_at > now() - make_interval(days => $2)
         )
       ON CONFLICT (dedupe_key) WHERE deleted_at IS NULL DO NOTHING
       RETURNING id`,
      [
        this.configuration.get('REMINDER_INACTIVITY_DAYS', { infer: true }),
        this.configuration.get('REMINDER_INACTIVITY_MIN_INTERVAL_DAYS', {
          infer: true,
        }),
        USER_ROLE,
      ],
    );
    return rows.length;
  }

  /** Claims due reminders and delivers each one, re-checking it first. */
  async dispatchDue(): Promise<DispatchSummary> {
    const summary: DispatchSummary = {
      claimed: 0,
      sent: 0,
      logged: 0,
      retried: 0,
      failed: 0,
      cancelled: 0,
    };

    const claims = await this.claimDue();
    summary.claimed = claims.length;

    for (const claim of claims) {
      try {
        const outcome = await this.deliver(claim);
        if (outcome) summary[outcome] += 1;
      } catch (error) {
        // A database failure here leaves the row `sending`; its lock
        // expires and the next tick reclaims it.
        this.logger.error(
          `Could not process reminder email ${claim.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    return summary;
  }

  /**
   * Due rows are `pending` ones whose time has come, and `sending` ones
   * abandoned by a crashed dispatcher. Claiming counts the attempt.
   */
  private async claimDue(): Promise<ReminderClaim[]> {
    const [rows]: [ReminderClaim[], number] = await this.dataSource.query(
      `WITH due AS (
         SELECT id, status = '${ReminderEmailStatus.Sending}' AS recovered
         FROM email_reminder
         WHERE deleted_at IS NULL
           AND (
             (status = '${ReminderEmailStatus.Pending}' AND next_attempt_at <= now())
             OR (status = '${ReminderEmailStatus.Sending}' AND locked_until < now())
           )
         ORDER BY next_attempt_at, id
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE email_reminder er
       SET status = '${ReminderEmailStatus.Sending}',
           attempts = er.attempts + 1,
           locked_until = now() + make_interval(mins => $2),
           updated_at = now()
       FROM due
       WHERE er.id = due.id
       RETURNING er.id, er.attempts, due.recovered`,
      [
        this.configuration.get('REMINDER_EMAIL_BATCH_SIZE', { infer: true }),
        SENDING_LOCK_MINUTES,
      ],
    );
    return rows;
  }

  private async deliver(
    claim: ReminderClaim,
  ): Promise<keyof Omit<DispatchSummary, 'claimed'> | null> {
    const { id } = claim;
    const reminder = await this.loadClaimed(claim);
    if (!reminder) return null;

    const staleReason = this.staleReason(reminder);
    if (staleReason) {
      if (
        !(await this.finish(claim, ReminderEmailStatus.Cancelled, {
          cancelled_reason: staleReason,
        }))
      )
        return null;
      this.logger.log({
        event: 'reminder_email_cancelled',
        id,
        kind: reminder.kind,
        reason: staleReason,
      });
      return 'cancelled';
    }

    const maxAttempts = this.configuration.get('REMINDER_EMAIL_MAX_ATTEMPTS', {
      infer: true,
    });
    if (reminder.attempts > maxAttempts && !claim.recovered) {
      // A pending retry must respect the configured limit. An abandoned send
      // has an unknown provider outcome: replay its idempotency key even after
      // the last attempt to recover acceptance before declaring a failure.
      if (
        !(await this.finish(claim, ReminderEmailStatus.Failed, {
          last_error: 'attempts exhausted while sending',
        }))
      )
        return null;
      return 'failed';
    }

    const content = this.render(reminder);

    let result: EmailDeliveryResult;
    try {
      result = await this.emailService.send({
        to: reminder.email,
        subject: content.subject,
        text: content.text,
        html: content.html,
        idempotencyKey: `smartplan-reminder-${reminder.dedupe_key}`,
        logSummary: `[${reminder.kind}] ${content.subject} -> ${this.link(reminder)}`,
      });
    } catch (error) {
      const decision = decideAfterFailure(
        error,
        reminder.attempts,
        maxAttempts,
      );

      if (decision.outcome === 'retry') {
        if (
          !(await this.finish(claim, ReminderEmailStatus.Pending, {
            next_attempt_at: new Date(Date.now() + decision.delayMs),
            last_error: decision.error,
          }))
        )
          return null;
        this.logger.warn({
          event: 'reminder_email_retry_scheduled',
          id,
          kind: reminder.kind,
          attempt: reminder.attempts,
          delayMs: decision.delayMs,
          error: decision.error,
        });
        return 'retried';
      }

      if (
        !(await this.finish(claim, ReminderEmailStatus.Failed, {
          last_error: decision.error,
        }))
      )
        return null;
      this.logger.error({
        event: 'reminder_email_failed',
        id,
        kind: reminder.kind,
        attempt: reminder.attempts,
        error: decision.error,
      });
      return 'failed';
    }

    // Persistence failures must reach dispatchDue: leave the claim recoverable,
    // rather than classifying a database outage as a permanent provider error.
    if (result.transport === EmailTransport.Log) {
      if (!(await this.finish(claim, ReminderEmailStatus.Logged, {})))
        return null;
      this.logger.log({
        event: 'reminder_email_logged',
        id,
        kind: reminder.kind,
      });
      return 'logged';
    }

    if (
      !(await this.finish(claim, ReminderEmailStatus.Sent, {
        provider_message_id: result.providerMessageId,
        sent_at: new Date(),
        last_error: null,
      }))
    )
      return null;
    this.logger.log({
      event: 'reminder_email_sent',
      id,
      kind: reminder.kind,
      attempt: reminder.attempts,
      providerMessageId: result.providerMessageId,
    });
    return 'sent';
  }

  private async loadClaimed(
    claim: ReminderClaim,
  ): Promise<ClaimedReminder | null> {
    const rows: ClaimedReminder[] = await this.dataSource.query(
      `SELECT er.id, er.kind, er.dedupe_key, er.attempts, er.created_at,
              er.id_plan, u.email, u.name,
              ${RECIPIENT_ELIGIBLE_SQL} AS recipient_eligible,
              p.title AS plan_title,
              CASE WHEN p.id IS NULL THEN NULL ELSE ${FEEDBACK_PENDING_SQL} END
                AS feedback_pending,
              ${LAST_ACTIVITY_SQL} AS last_activity_at
       FROM email_reminder er
       JOIN "user" u ON u.id = er.id_user
       LEFT JOIN plan p ON p.id = er.id_plan
       WHERE er.id = $1 AND er.deleted_at IS NULL
         AND er.status = '${ReminderEmailStatus.Sending}'
         AND er.attempts = $2 AND er.locked_until > now()`,
      [claim.id, claim.attempts],
    );
    return rows[0] ?? null;
  }

  /** Why a queued reminder is no longer true, or `null` to send it. */
  private staleReason(reminder: ClaimedReminder): string | null {
    if (!reminder.recipient_eligible) return 'recipient_not_eligible';

    if (reminder.kind === ReminderKind.Feedback) {
      return reminder.feedback_pending ? null : 'feedback_completed';
    }

    // Any plan created after the reminder was queued ends the inactivity.
    return new Date(reminder.last_activity_at) > new Date(reminder.created_at)
      ? 'activity_resumed'
      : null;
  }

  private render(reminder: ClaimedReminder): RenderedEmail {
    const link = this.link(reminder);
    if (reminder.kind === ReminderKind.Feedback) {
      return feedbackReminderEmail({
        name: reminder.name,
        planTitle: reminder.plan_title ?? 'tu salida',
        link,
      });
    }
    return inactivityReminderEmail({ name: reminder.name, link });
  }

  /**
   * Private screens send an anonymous visitor to `/login?redirect=<route>`
   * and back, so the destination survives signing in.
   */
  private link(reminder: Pick<ClaimedReminder, 'kind' | 'id_plan'>): string {
    const frontend = this.configuration.get('FRONTEND_URL', { infer: true });
    return reminder.kind === ReminderKind.Feedback
      ? `${frontend}/outings/${reminder.id_plan}`
      : `${frontend}/plans/create`;
  }

  /** Final state change; a no-op if another dispatcher reclaimed the row. */
  private async finish(
    claim: ReminderClaim,
    status: ReminderEmailStatus,
    fields: Partial<
      Record<
        | 'next_attempt_at'
        | 'provider_message_id'
        | 'sent_at'
        | 'last_error'
        | 'cancelled_reason',
        Date | string | null
      >
    >,
  ): Promise<boolean> {
    const entries = Object.entries(fields);
    const assignments = entries
      .map(([column], index) => `, ${column} = $${index + 3}`)
      .join('');

    const [, updated]: [unknown[], number] = await this.dataSource.query(
      `UPDATE email_reminder
       SET status = $2, locked_until = NULL, updated_at = now()${assignments}
       WHERE id = $1 AND status = '${ReminderEmailStatus.Sending}'
         AND attempts = $${entries.length + 3}
       RETURNING id`,
      [claim.id, status, ...entries.map(([, value]) => value), claim.attempts],
    );
    return updated === 1;
  }
}
