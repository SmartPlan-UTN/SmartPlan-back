import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditExportAction1791840000000 implements MigrationInterface {
  name = 'AddAuditExportAction1791840000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."audit_log_action_enum" ADD VALUE IF NOT EXISTS 'export'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Lock writers until the replacement enum is installed; never discard audit history.
    await queryRunner.query(`LOCK TABLE "audit_log" IN ACCESS EXCLUSIVE MODE`);
    await queryRunner.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM "audit_log" WHERE "action"::text = 'export') THEN
        RAISE EXCEPTION 'Cannot remove export action while export audit records exist';
      END IF;
    END $$`);
    await queryRunner.query(
      `ALTER TYPE "public"."audit_log_action_enum" RENAME TO "audit_log_action_enum_with_export"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."audit_log_action_enum" AS ENUM ('create', 'update', 'delete', 'start_session', 'end_session')`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_log" ALTER COLUMN "action" TYPE "public"."audit_log_action_enum" USING "action"::text::"public"."audit_log_action_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."audit_log_action_enum_with_export"`,
    );
  }
}
