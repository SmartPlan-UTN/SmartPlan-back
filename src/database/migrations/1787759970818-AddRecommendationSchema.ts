import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRecommendationSchema1787759970818 implements MigrationInterface {
  name = 'AddRecommendationSchema1787759970818';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "feedback" DROP CONSTRAINT "FK_5afd8f4854a99c7e1bced77fa04"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5afd8f4854a99c7e1bced77fa0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "feedback" DROP CONSTRAINT "CHK_cc3c345cedcd9beed043882d91"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" DROP CONSTRAINT "CHK_6d4e2de64d1ee96d8b0decab06"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" DROP CONSTRAINT "CHK_5df272fb239f131373f1911ffe"`,
    );
    await queryRunner.query(
      `ALTER TABLE "feedback" DROP COLUMN "id_plan_request"`,
    );
    await queryRunner.query(`ALTER TABLE "feedback" DROP COLUMN "title"`);
    await queryRunner.query(`ALTER TABLE "feedback" DROP COLUMN "description"`);
    await queryRunner.query(
      `ALTER TABLE "feedback" ADD "rating" smallint NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "feedback" ADD "tags" text array NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(`ALTER TABLE "feedback" ADD "comment" text`);
    await queryRunner.query(
      `ALTER TABLE "feedback" ADD "id_plan" integer NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."plan_request_mode_enum" AS ENUM('automatic', 'surprise')`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ADD "mode" "public"."plan_request_mode_enum" NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "plan_request" ADD "raw_query" text`);
    await queryRunner.query(
      `ALTER TABLE "plan_request" ADD "raw_context" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ADD "intent_resolved_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ADD "processing_started_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ADD "recovery_attempts" smallint NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ADD "recovery_claimed_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ADD "failure_code" character varying(60)`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ADD "failure_detail" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ADD "failed_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan" ADD "completed_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan" ADD "feedback_requested_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan" ADD "travel_distance_meters" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan" ADD "travel_duration_seconds" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification" ADD "resource_type" character varying(40)`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification" ADD "resource_id" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" DROP CONSTRAINT "FK_aaa887b443a1b79d99a28bca043"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" DROP CONSTRAINT "FK_a3073e4d800bbcaafa89a8da1fb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ALTER COLUMN "budget" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ALTER COLUMN "id_department" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ALTER COLUMN "available_duration" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ALTER COLUMN "id_outing_type" DROP NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_2ec07f9483cb5fc1c71943bbc5" ON "feedback" ("id_plan") `,
    );
    await queryRunner.query(
      `ALTER TABLE "feedback" ADD CONSTRAINT "CHK_5a70a58ace591ccdcdcfcc2af6" CHECK ("actual_cost" IS NULL OR "actual_cost" > 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "feedback" ADD CONSTRAINT "CHK_85109fe649a7a9f9d626b6fe5b" CHECK ("rating" BETWEEN 1 AND 5)`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ADD CONSTRAINT "CHK_c3eff1394ca0b135c2e37d5620" CHECK ("available_duration" IS NULL OR "available_duration" > 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ADD CONSTRAINT "CHK_62c462b09b0c9d21bbc880ed5b" CHECK ("budget" IS NULL OR "budget" >= 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "feedback" ADD CONSTRAINT "FK_2ec07f9483cb5fc1c71943bbc5b" FOREIGN KEY ("id_plan") REFERENCES "plan"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ADD CONSTRAINT "FK_aaa887b443a1b79d99a28bca043" FOREIGN KEY ("id_department") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ADD CONSTRAINT "FK_a3073e4d800bbcaafa89a8da1fb" FOREIGN KEY ("id_outing_type") REFERENCES "outing_type"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "plan_request" DROP CONSTRAINT "FK_a3073e4d800bbcaafa89a8da1fb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" DROP CONSTRAINT "FK_aaa887b443a1b79d99a28bca043"`,
    );
    await queryRunner.query(
      `ALTER TABLE "feedback" DROP CONSTRAINT "FK_2ec07f9483cb5fc1c71943bbc5b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" DROP CONSTRAINT "CHK_62c462b09b0c9d21bbc880ed5b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" DROP CONSTRAINT "CHK_c3eff1394ca0b135c2e37d5620"`,
    );
    await queryRunner.query(
      `ALTER TABLE "feedback" DROP CONSTRAINT "CHK_85109fe649a7a9f9d626b6fe5b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "feedback" DROP CONSTRAINT "CHK_5a70a58ace591ccdcdcfcc2af6"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2ec07f9483cb5fc1c71943bbc5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ALTER COLUMN "id_outing_type" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ALTER COLUMN "available_duration" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ALTER COLUMN "id_department" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ALTER COLUMN "budget" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ADD CONSTRAINT "FK_a3073e4d800bbcaafa89a8da1fb" FOREIGN KEY ("id_outing_type") REFERENCES "outing_type"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ADD CONSTRAINT "FK_aaa887b443a1b79d99a28bca043" FOREIGN KEY ("id_department") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification" DROP COLUMN "resource_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification" DROP COLUMN "resource_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan" DROP COLUMN "travel_duration_seconds"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan" DROP COLUMN "travel_distance_meters"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan" DROP COLUMN "feedback_requested_at"`,
    );
    await queryRunner.query(`ALTER TABLE "plan" DROP COLUMN "completed_at"`);
    await queryRunner.query(
      `ALTER TABLE "plan_request" DROP COLUMN "failed_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" DROP COLUMN "failure_detail"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" DROP COLUMN "failure_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" DROP COLUMN "recovery_claimed_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" DROP COLUMN "recovery_attempts"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" DROP COLUMN "processing_started_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" DROP COLUMN "intent_resolved_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" DROP COLUMN "raw_context"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" DROP COLUMN "raw_query"`,
    );
    await queryRunner.query(`ALTER TABLE "plan_request" DROP COLUMN "mode"`);
    await queryRunner.query(`DROP TYPE "public"."plan_request_mode_enum"`);
    await queryRunner.query(`ALTER TABLE "feedback" DROP COLUMN "id_plan"`);
    await queryRunner.query(`ALTER TABLE "feedback" DROP COLUMN "comment"`);
    await queryRunner.query(`ALTER TABLE "feedback" DROP COLUMN "tags"`);
    await queryRunner.query(`ALTER TABLE "feedback" DROP COLUMN "rating"`);
    await queryRunner.query(`ALTER TABLE "feedback" ADD "description" text`);
    await queryRunner.query(
      `ALTER TABLE "feedback" ADD "title" character varying(150) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "feedback" ADD "id_plan_request" integer NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ADD CONSTRAINT "CHK_5df272fb239f131373f1911ffe" CHECK ((budget >= (0)::numeric))`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ADD CONSTRAINT "CHK_6d4e2de64d1ee96d8b0decab06" CHECK ((available_duration > 0))`,
    );
    await queryRunner.query(
      `ALTER TABLE "feedback" ADD CONSTRAINT "CHK_cc3c345cedcd9beed043882d91" CHECK (((actual_cost IS NULL) OR (actual_cost >= (0)::numeric)))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5afd8f4854a99c7e1bced77fa0" ON "feedback" ("id_plan_request") `,
    );
    await queryRunner.query(
      `ALTER TABLE "feedback" ADD CONSTRAINT "FK_5afd8f4854a99c7e1bced77fa04" FOREIGN KEY ("id_plan_request") REFERENCES "plan_request"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
