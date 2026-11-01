import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `plan.visibility` (CU20). SmartPlan has no plan-level visibility model:
 * `GET /api/plans` (CU12) already exposes every non-cancelled plan of every
 * user, but that is a pre-existing decision this migration does not widen.
 *
 * `visibility` is consumed **only** by `GET /api/plan-recommendations`: the
 * recommendation pool is restricted to `public` plans. A plan turns `public`
 * when it is AI-generated (`id_plan_request IS NOT NULL`) and reaches the
 * `completed` status; manually created plans (CU24) stay `private`.
 *
 * Backfill mirrors that rule so the feed keeps behaving as before: existing
 * generated + completed plans become `public`, everything else `private`.
 */
export class AddPlanVisibility1787900000000 implements MigrationInterface {
  name = 'AddPlanVisibility1787900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."plan_visibility_enum" AS ENUM('private', 'public')`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan" ADD "visibility" "public"."plan_visibility_enum" NOT NULL DEFAULT 'private'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_plan_visibility" ON "plan" ("visibility")`,
    );
    await queryRunner.query(
      `UPDATE "plan"
       SET "visibility" = 'public'
       FROM "plan_status"
       WHERE "plan"."id_plan_status" = "plan_status"."id"
         AND "plan_status"."key" = 'completed'
         AND "plan"."id_plan_request" IS NOT NULL
         AND "plan"."deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_plan_visibility"`);
    await queryRunner.query(`ALTER TABLE "plan" DROP COLUMN "visibility"`);
    await queryRunner.query(`DROP TYPE "public"."plan_visibility_enum"`);
  }
}
