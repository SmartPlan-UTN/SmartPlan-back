import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditActorForPermissions1788100000000 implements MigrationInterface {
  name = 'AddAuditActorForPermissions1788100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "id_actor" integer`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_log_actor" ON "audit_log" ("id_actor")`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_audit_log_actor'
        ) THEN
          ALTER TABLE "audit_log"
            ADD CONSTRAINT "FK_audit_log_actor"
            FOREIGN KEY ("id_actor") REFERENCES "user"("id") ON DELETE RESTRICT;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "audit_log" DROP CONSTRAINT IF EXISTS "FK_audit_log_actor"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_log_actor"`);
    await queryRunner.query(
      `ALTER TABLE "audit_log" DROP COLUMN IF EXISTS "id_actor"`,
    );
  }
}
