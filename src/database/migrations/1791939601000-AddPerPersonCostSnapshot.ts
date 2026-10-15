import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerPersonCostSnapshot1791939601000 implements MigrationInterface {
  name = 'AddPerPersonCostSnapshot1791939601000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "plan_detail" ADD "per_person_cost" numeric(10,2), ADD CONSTRAINT "CHK_plan_detail_per_person_cost" CHECK ("per_person_cost" IS NULL OR "per_person_cost" >= 0)',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "plan_detail" DROP CONSTRAINT "CHK_plan_detail_per_person_cost", DROP COLUMN "per_person_cost"',
    );
  }
}
