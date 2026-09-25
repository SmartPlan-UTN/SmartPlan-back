import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlanRequestProgress1789516800000 implements MigrationInterface {
  name = 'AddPlanRequestProgress1789516800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "plan_request"
      ADD "progress_stage" character varying,
      ADD "progress_stage_at" TIMESTAMP WITH TIME ZONE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "plan_request"
      DROP COLUMN "progress_stage_at",
      DROP COLUMN "progress_stage"
    `);
  }
}
