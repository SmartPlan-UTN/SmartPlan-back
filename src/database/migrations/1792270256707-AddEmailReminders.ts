import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reminder emails (#127): the `email_reminder` outbox and the per-user
 * opt-out. Existing accounts keep receiving reminders (`DEFAULT true`).
 */
export class AddEmailReminders1792270256707 implements MigrationInterface {
  name = 'AddEmailReminders1792270256707';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD "email_reminders_enabled" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `CREATE TABLE "email_reminder" (
        "id" SERIAL NOT NULL,
        "id_user" integer NOT NULL,
        "kind" character varying(20) NOT NULL,
        "dedupe_key" character varying(120) NOT NULL,
        "id_plan" integer,
        "status" character varying(20) NOT NULL DEFAULT 'pending',
        "attempts" integer NOT NULL DEFAULT 0,
        "next_attempt_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "locked_until" TIMESTAMP WITH TIME ZONE,
        "provider_message_id" character varying(100),
        "last_error" character varying(500),
        "cancelled_reason" character varying(60),
        "sent_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "CHK_email_reminder_kind" CHECK ("kind" IN ('inactivity', 'feedback')),
        CONSTRAINT "CHK_email_reminder_status" CHECK ("status" IN ('pending', 'sending', 'sent', 'logged', 'failed', 'cancelled')),
        CONSTRAINT "CHK_email_reminder_feedback_plan" CHECK ("kind" <> 'feedback' OR "id_plan" IS NOT NULL),
        CONSTRAINT "PK_ed63864ee00c90cceb71b34fc3b" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_email_reminder_dedupe_key" ON "email_reminder" ("dedupe_key") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_email_reminder_due" ON "email_reminder" ("status", "next_attempt_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_email_reminder_user_kind" ON "email_reminder" ("id_user", "kind", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_email_reminder_plan" ON "email_reminder" ("id_plan")`,
    );
    await queryRunner.query(
      `ALTER TABLE "email_reminder" ADD CONSTRAINT "FK_email_reminder_user" FOREIGN KEY ("id_user") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "email_reminder" ADD CONSTRAINT "FK_email_reminder_plan" FOREIGN KEY ("id_plan") REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "email_reminder"`);
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "email_reminders_enabled"`,
    );
  }
}
