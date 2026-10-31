import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCommunityProfilesAndInspiration1792800000000 implements MigrationInterface {
  name = 'AddCommunityProfilesAndInspiration1792800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "user" ADD COLUMN "username" varchar(24)',
    );
    await queryRunner.query('ALTER TABLE "user" ADD COLUMN "bio" varchar(160)');
    await queryRunner.query(
      `UPDATE "user" SET "username" = 'viajero' || "id"::text WHERE "username" IS NULL AND "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_user_username_unique" ON "user" (LOWER("username")) WHERE "username" IS NOT NULL AND "deleted_at" IS NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "plan" ADD COLUMN "id_inspired_by_plan" integer REFERENCES "plan"("id") ON DELETE SET NULL',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_plan_inspired_by" ON "plan" ("id_inspired_by_plan")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_plan_inspired_by"');
    await queryRunner.query(
      'ALTER TABLE "plan" DROP COLUMN "id_inspired_by_plan"',
    );
    await queryRunner.query('DROP INDEX "IDX_user_username_unique"');
    await queryRunner.query('ALTER TABLE "user" DROP COLUMN "bio"');
    await queryRunner.query('ALTER TABLE "user" DROP COLUMN "username"');
  }
}
