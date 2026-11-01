import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { Plan } from '../../plans/entities/plan.entity';
import { User } from '../../users/entities/user.entity';

export enum ReminderKind {
  /** "Hace mucho que no armás un plan". */
  Inactivity = 'inactivity',
  /** "Recordá completar la retroalimentación" of a completed outing (CU23). */
  Feedback = 'feedback',
}

/**
 * Where a reminder email is in its life. The states keep apart what the
 * issue asks to keep apart (#127):
 *
 *  - `pending` / `sending`: queued, or claimed by one dispatcher.
 *  - `sent`: the provider **accepted** the message and returned an id.
 *    Acceptance is not reception: whether it reached the inbox (or spam) is
 *    checked in the provider's dashboard with `provider_message_id`.
 *  - `logged`: `EMAIL_TRANSPORT=log` wrote it to the log. Never a delivery.
 *  - `failed`: a permanent provider error, or retries exhausted.
 *  - `cancelled`: no longer true when it was about to go out (the person
 *    answered the feedback, created a plan, opted out, or was deactivated).
 */
export enum ReminderEmailStatus {
  Pending = 'pending',
  Sending = 'sending',
  Sent = 'sent',
  Logged = 'logged',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

/**
 * Outbox of reminder emails. One row per reminder *event*: `dedupe_key` is
 * unique, so concurrent scheduler ticks or several API replicas enqueueing
 * the same event resolve to exactly one row (`ON CONFLICT DO NOTHING`), and
 * the same key is the provider idempotency key when it is sent. Like every
 * table, it soft-deletes (`BaseEntity`), and the key is unique among live rows.
 *
 * Plain `varchar` + CHECK instead of Postgres enums: shared enums are what
 * breaks TypeORM's development `synchronize`.
 */
@Entity('email_reminder')
@Check('CHK_email_reminder_kind', `"kind" IN ('inactivity', 'feedback')`)
@Check(
  'CHK_email_reminder_status',
  `"status" IN ('pending', 'sending', 'sent', 'logged', 'failed', 'cancelled')`,
)
@Check(
  'CHK_email_reminder_feedback_plan',
  `"kind" <> 'feedback' OR "id_plan" IS NOT NULL`,
)
@Index('IDX_email_reminder_dedupe_key', ['dedupeKey'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Index('IDX_email_reminder_due', ['status', 'nextAttemptAt'])
@Index('IDX_email_reminder_user_kind', ['idUser', 'kind', 'createdAt'])
export class EmailReminder extends BaseEntity {
  @Column({ name: 'id_user', type: 'integer' })
  idUser: number;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'id_user',
    foreignKeyConstraintName: 'FK_email_reminder_user',
  })
  user: User;

  @Column({ type: 'varchar', length: 20 })
  kind: ReminderKind;

  @Column({ name: 'dedupe_key', type: 'varchar', length: 120 })
  dedupeKey: string;

  /** The outing a feedback reminder is about; `null` for inactivity. */
  @Index('IDX_email_reminder_plan')
  @Column({ name: 'id_plan', type: 'integer', nullable: true })
  idPlan: number | null;

  @ManyToOne(() => Plan, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'id_plan',
    foreignKeyConstraintName: 'FK_email_reminder_plan',
  })
  plan: Plan | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: ReminderEmailStatus.Pending,
  })
  status: ReminderEmailStatus;

  /** Send attempts started so far, including the one in progress. */
  @Column({ type: 'integer', default: 0 })
  attempts: number;

  @Column({
    name: 'next_attempt_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  nextAttemptAt: Date;

  /** A `sending` row whose lock expired was abandoned and can be reclaimed. */
  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @Column({
    name: 'provider_message_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  providerMessageId: string | null;

  @Column({ name: 'last_error', type: 'varchar', length: 500, nullable: true })
  lastError: string | null;

  @Column({
    name: 'cancelled_reason',
    type: 'varchar',
    length: 60,
    nullable: true,
  })
  cancelledReason: string | null;

  /** When the provider accepted it. `null` for every other status. */
  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null;
}
