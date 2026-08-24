import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlanManagement1787269000000 implements MigrationInterface {
  name = 'AddPlanManagement1787269000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "plan" ADD "people_count" integer NOT NULL DEFAULT '1'`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan" ADD CONSTRAINT "CHK_plan_people_count" CHECK ("people_count" >= 1)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_plan_detail_plan_activity_unique" ON "plan_detail" ("id_plan", "id_activity") WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_plan_detail_plan_activity_unique"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan" DROP CONSTRAINT "CHK_plan_people_count"`,
    );
    await queryRunner.query(`ALTER TABLE "plan" DROP COLUMN "people_count"`);
  }
}
