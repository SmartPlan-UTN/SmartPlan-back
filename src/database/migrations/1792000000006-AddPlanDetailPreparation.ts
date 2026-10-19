import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Plan readiness: when the person confirmed a pending preparation step
 * (tickets, a reservation) of a stop. Null means not confirmed.
 */
export class AddPlanDetailPreparation1792000000006 implements MigrationInterface {
  name = 'AddPlanDetailPreparation1792000000006';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "plan_detail" ADD COLUMN IF NOT EXISTS "preparation_confirmed_at" timestamptz`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "plan_detail" DROP COLUMN IF EXISTS "preparation_confirmed_at"`,
    );
  }
}
