import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlanComposerRequests1789600000000 implements MigrationInterface {
  name = 'AddPlanComposerRequests1789600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "plan" ADD "composer_request_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan" ADD "composer_update_request_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan" ADD "composer_update_request_hash" character varying(64)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_plan_composer_request" ON "plan" ("id_user", "composer_request_id") WHERE "composer_request_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_plan_composer_request"`);
    await queryRunner.query(
      `ALTER TABLE "plan" DROP COLUMN "composer_update_request_hash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan" DROP COLUMN "composer_update_request_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan" DROP COLUMN "composer_request_id"`,
    );
  }
}
