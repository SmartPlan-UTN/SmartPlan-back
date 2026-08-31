import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditActor1788200000000 implements MigrationInterface {
  name = 'AddAuditActor1788200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "audit_log" ADD "id_actor" integer`);
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_log_actor" ON "audit_log" ("id_actor")`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_log" ADD CONSTRAINT "FK_audit_log_actor" FOREIGN KEY ("id_actor") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "audit_log" DROP CONSTRAINT "FK_audit_log_actor"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_audit_log_actor"`);
    await queryRunner.query(`ALTER TABLE "audit_log" DROP COLUMN "id_actor"`);
  }
}
