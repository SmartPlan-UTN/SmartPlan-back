import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AlterPlanRequestForRecommendation1787268000000 implements MigrationInterface {
  name = 'AlterPlanRequestForRecommendation1787268000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."plan_request_mode_enum" AS ENUM('automatic', 'surprise')`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ADD "mode" "public"."plan_request_mode_enum" NOT NULL DEFAULT 'automatic'`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ALTER COLUMN "mode" DROP DEFAULT`,
    );

    await queryRunner.addColumns('plan_request', [
      new TableColumn({ name: 'raw_query', type: 'text', isNullable: true }),
      new TableColumn({ name: 'raw_context', type: 'jsonb', isNullable: true }),
      new TableColumn({
        name: 'intent_resolved_at',
        type: 'timestamptz',
        isNullable: true,
      }),
      new TableColumn({
        name: 'processing_started_at',
        type: 'timestamptz',
        isNullable: true,
      }),
      new TableColumn({
        name: 'recovery_attempts',
        type: 'smallint',
        isNullable: false,
        default: 0,
      }),
      new TableColumn({
        name: 'failure_code',
        type: 'varchar',
        length: '60',
        isNullable: true,
      }),
      new TableColumn({
        name: 'failure_detail',
        type: 'jsonb',
        isNullable: true,
      }),
      new TableColumn({
        name: 'failed_at',
        type: 'timestamptz',
        isNullable: true,
      }),
    ]);

    await queryRunner.query(
      `ALTER TABLE "plan_request" DROP CONSTRAINT IF EXISTS "CHK_plan_request_budget"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ALTER COLUMN "budget" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ADD CONSTRAINT "CHK_plan_request_budget" CHECK ("budget" IS NULL OR "budget" >= 0)`,
    );

    await queryRunner.query(
      `ALTER TABLE "plan_request" ALTER COLUMN "id_department" DROP NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "plan_request" DROP CONSTRAINT IF EXISTS "CHK_plan_request_available_duration"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ALTER COLUMN "available_duration" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ADD CONSTRAINT "CHK_plan_request_available_duration" CHECK ("available_duration" IS NULL OR "available_duration" > 0)`,
    );

    await queryRunner.query(
      `ALTER TABLE "plan_request" ALTER COLUMN "id_outing_type" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "plan_request" ALTER COLUMN "id_outing_type" SET NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "plan_request" DROP CONSTRAINT IF EXISTS "CHK_plan_request_available_duration"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ALTER COLUMN "available_duration" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ADD CONSTRAINT "CHK_plan_request_available_duration" CHECK ("available_duration" > 0)`,
    );

    await queryRunner.query(
      `ALTER TABLE "plan_request" ALTER COLUMN "id_department" SET NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "plan_request" DROP CONSTRAINT IF EXISTS "CHK_plan_request_budget"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ALTER COLUMN "budget" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ADD CONSTRAINT "CHK_plan_request_budget" CHECK ("budget" >= 0)`,
    );

    await queryRunner.dropColumns('plan_request', [
      'failed_at',
      'failure_detail',
      'failure_code',
      'recovery_attempts',
      'processing_started_at',
      'intent_resolved_at',
      'raw_context',
      'raw_query',
    ]);

    await queryRunner.query(`ALTER TABLE "plan_request" DROP COLUMN "mode"`);
    await queryRunner.query(`DROP TYPE "public"."plan_request_mode_enum"`);
  }
}
