import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddActivitySearchConstraints1791939600000 implements MigrationInterface {
  name = 'AddActivitySearchConstraints1791939600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "activity"
      ADD "cost_basis" varchar(20) NOT NULL DEFAULT 'per_party',
      ADD "available_times_of_day" text[] NOT NULL DEFAULT '{}'::text[],
      ADD "min_people" integer,
      ADD "max_people" integer,
      ADD CONSTRAINT "CHK_activity_cost_basis" CHECK ("cost_basis" IN ('per_party', 'per_person')),
      ADD CONSTRAINT "CHK_activity_available_times" CHECK ("available_times_of_day" <@ ARRAY['morning','afternoon','evening','night']::text[]),
      ADD CONSTRAINT "CHK_activity_people" CHECK (("min_people" IS NULL OR "min_people" >= 1) AND ("max_people" IS NULL OR "max_people" >= 1) AND ("min_people" IS NULL OR "max_people" IS NULL OR "min_people" <= "max_people"))`);
    await queryRunner.query(
      'ALTER TABLE "plan_request" ADD "resolved_options" jsonb',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_activity_search_limits" ON "activity" ("estimated_cost", "estimated_duration", "id") WHERE "deleted_at" IS NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_activity_search_limits"');
    await queryRunner.query(
      'ALTER TABLE "plan_request" DROP COLUMN "resolved_options"',
    );
    await queryRunner.query(
      `ALTER TABLE "activity" DROP CONSTRAINT "CHK_activity_people", DROP CONSTRAINT "CHK_activity_available_times", DROP CONSTRAINT "CHK_activity_cost_basis", DROP COLUMN "max_people", DROP COLUMN "min_people", DROP COLUMN "available_times_of_day", DROP COLUMN "cost_basis"`,
    );
  }
}
