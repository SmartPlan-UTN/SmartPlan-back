import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Planning engine (Intelligent Search v1): place-action stops, a timeline on
 * plan details, the planner's trace, behavioural events, and durable place
 * facts (opening hours, contextual traits). Additive; down() restores the
 * previous shape (it refuses while place-action stops exist, since those
 * cannot be represented without `id_place`).
 */
export class AddPlanningEngine1792000000000 implements MigrationInterface {
  name = 'AddPlanningEngine1792000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Place-action stops and the per-stop timeline.
    await queryRunner.query(
      `ALTER TABLE "plan_detail"
         ALTER COLUMN "id_activity" DROP NOT NULL,
         ADD "id_place" integer,
         ADD "action" character varying(40),
         ADD "start_minute" integer,
         ADD "leg_travel_minutes" integer,
         ADD "leg_distance_meters" integer,
         ADD "estimate_basis" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_detail"
         ADD CONSTRAINT "CHK_plan_detail_stop_target" CHECK ("id_activity" IS NOT NULL OR ("id_place" IS NOT NULL AND "action" IS NOT NULL)),
         ADD CONSTRAINT "CHK_plan_detail_leg" CHECK (("leg_travel_minutes" IS NULL OR "leg_travel_minutes" >= 0) AND ("leg_distance_meters" IS NULL OR "leg_distance_meters" >= 0)),
         ADD CONSTRAINT "FK_plan_detail_place" FOREIGN KEY ("id_place") REFERENCES "place"("id") ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_plan_detail_place" ON "plan_detail" ("id_place")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_plan_detail_place_action" ON "plan_detail" ("id_plan", "id_place", "action") WHERE "deleted_at" IS NULL AND "id_activity" IS NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "plan" ADD "starts_at" TIMESTAMP WITH TIME ZONE, ADD "ranking_meta" jsonb`,
    );

    await queryRunner.query(
      `ALTER TABLE "plan_request" ADD "generation_trace" jsonb, ADD "id_parent_request" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ADD CONSTRAINT "FK_plan_request_parent" FOREIGN KEY ("id_parent_request") REFERENCES "plan_request"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_plan_request_parent" ON "plan_request" ("id_parent_request")`,
    );

    // Spend observed on a place-action stop has no Activity to point at.
    await queryRunner.query(
      `ALTER TABLE "activity_price_observation"
         ALTER COLUMN "id_activity" DROP NOT NULL,
         ADD "id_place" integer,
         ADD "action" character varying(40),
         ADD CONSTRAINT "CHK_activity_price_observation_target" CHECK ("id_activity" IS NOT NULL OR ("id_place" IS NOT NULL AND "action" IS NOT NULL))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_activity_price_observation_place" ON "activity_price_observation" ("id_place", "action", "observed_at")`,
    );

    await queryRunner.query(
      `CREATE TABLE "plan_event" (
         "id" SERIAL NOT NULL,
         "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "deleted_at" TIMESTAMP WITH TIME ZONE,
         "id_user" integer NOT NULL,
         "id_plan" integer,
         "id_plan_request" integer,
         "type" character varying(40) NOT NULL,
         "stop_ref" jsonb,
         "payload" jsonb,
         "ranking_version" character varying(20),
         CONSTRAINT "CHK_plan_event_type" CHECK ("type" IN ('RECOMMENDATION_SHOWN','PLAN_OPENED','PLAN_SAVED','STOP_SWAPPED','STOP_REMOVED','STOP_REORDERED','REFINEMENT_APPLIED','PLAN_STARTED','STOP_SKIPPED','PLAN_COMPLETED','PLAN_RATED','SPEND_REPORTED','STOP_SPEND_REPORTED','EXPERIENCE_TAGS_REPORTED','PRICE_REPORTED_WRONG','PLACE_REPORTED_CLOSED','OFFERING_REPORTED_UNAVAILABLE')),
         CONSTRAINT "PK_plan_event" PRIMARY KEY ("id"),
         CONSTRAINT "FK_plan_event_user" FOREIGN KEY ("id_user") REFERENCES "user"("id") ON DELETE CASCADE,
         CONSTRAINT "FK_plan_event_plan" FOREIGN KEY ("id_plan") REFERENCES "plan"("id") ON DELETE SET NULL,
         CONSTRAINT "FK_plan_event_request" FOREIGN KEY ("id_plan_request") REFERENCES "plan_request"("id") ON DELETE SET NULL
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_plan_event_type_created" ON "plan_event" ("type", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_plan_event_user_created" ON "plan_event" ("id_user", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_plan_event_plan" ON "plan_event" ("id_plan")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_plan_event_request" ON "plan_event" ("id_plan_request")`,
    );

    await queryRunner.query(
      `CREATE TABLE "place_opening_hours" (
         "id" SERIAL NOT NULL,
         "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "deleted_at" TIMESTAMP WITH TIME ZONE,
         "id_place" integer NOT NULL,
         "weekday" smallint NOT NULL,
         "closed" boolean NOT NULL DEFAULT false,
         "opens_minute" smallint,
         "closes_minute" smallint,
         "source" character varying(20) NOT NULL,
         "source_ref" character varying(500),
         "verified_at" TIMESTAMP WITH TIME ZONE NOT NULL,
         "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
         CONSTRAINT "CHK_place_opening_hours_weekday" CHECK ("weekday" BETWEEN 0 AND 6),
         CONSTRAINT "CHK_place_opening_hours_interval" CHECK ("closed" = true OR ("opens_minute" >= 0 AND "opens_minute" < 1440 AND "closes_minute" > "opens_minute" AND "closes_minute" <= 2880)),
         CONSTRAINT "CHK_place_opening_hours_source" CHECK ("source" IN ('OFFICIAL','SCHEMA_ORG','CURATED','USER')),
         CONSTRAINT "PK_place_opening_hours" PRIMARY KEY ("id"),
         CONSTRAINT "FK_place_opening_hours_place" FOREIGN KEY ("id_place") REFERENCES "place"("id") ON DELETE CASCADE
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_place_opening_hours_place" ON "place_opening_hours" ("id_place", "weekday")`,
    );

    await queryRunner.query(
      `CREATE TABLE "place_trait" (
         "id" SERIAL NOT NULL,
         "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "deleted_at" TIMESTAMP WITH TIME ZONE,
         "id_place" integer NOT NULL,
         "trait" character varying(40) NOT NULL,
         "score" numeric(3,2) NOT NULL,
         "source" character varying(20) NOT NULL,
         "confidence" numeric(3,2) NOT NULL,
         "support_count" integer NOT NULL DEFAULT 1,
         "evidence" character varying(300),
         CONSTRAINT "CHK_place_trait_score" CHECK ("score" BETWEEN -1 AND 1),
         CONSTRAINT "CHK_place_trait_confidence" CHECK ("confidence" BETWEEN 0 AND 1),
         CONSTRAINT "CHK_place_trait_source" CHECK ("source" IN ('CURATED','MENU_DERIVED','LLM_FROM_EVIDENCE','COMMUNITY')),
         CONSTRAINT "PK_place_trait" PRIMARY KEY ("id"),
         CONSTRAINT "FK_place_trait_place" FOREIGN KEY ("id_place") REFERENCES "place"("id") ON DELETE CASCADE
       )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_place_trait_source" ON "place_trait" ("id_place", "trait", "source") WHERE "deleted_at" IS NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT COUNT(*) AS count FROM "plan_detail" WHERE "id_activity" IS NULL`,
    )) as { count: string }[];
    const count = rows[0]?.count ?? '0';
    if (Number(count) > 0)
      throw new Error(
        `Cannot revert AddPlanningEngine: ${count} place-action plan stops exist and need an Activity to be represented.`,
      );
    await queryRunner.query(`DROP TABLE "place_trait"`);
    await queryRunner.query(`DROP TABLE "place_opening_hours"`);
    await queryRunner.query(`DROP TABLE "plan_event"`);
    await queryRunner.query(
      `DELETE FROM "activity_price_observation" WHERE "id_activity" IS NULL`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_activity_price_observation_place"`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_price_observation"
         DROP CONSTRAINT "CHK_activity_price_observation_target",
         DROP COLUMN "action",
         DROP COLUMN "id_place",
         ALTER COLUMN "id_activity" SET NOT NULL`,
    );
    await queryRunner.query(`DROP INDEX "IDX_plan_request_parent"`);
    await queryRunner.query(
      `ALTER TABLE "plan_request" DROP CONSTRAINT "FK_plan_request_parent", DROP COLUMN "id_parent_request", DROP COLUMN "generation_trace"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan" DROP COLUMN "ranking_meta", DROP COLUMN "starts_at"`,
    );
    await queryRunner.query(`DROP INDEX "UQ_plan_detail_place_action"`);
    await queryRunner.query(`DROP INDEX "IDX_plan_detail_place"`);
    await queryRunner.query(
      `ALTER TABLE "plan_detail"
         DROP CONSTRAINT "FK_plan_detail_place",
         DROP CONSTRAINT "CHK_plan_detail_leg",
         DROP CONSTRAINT "CHK_plan_detail_stop_target",
         DROP COLUMN "estimate_basis",
         DROP COLUMN "leg_distance_meters",
         DROP COLUMN "leg_travel_minutes",
         DROP COLUMN "start_minute",
         DROP COLUMN "action",
         DROP COLUMN "id_place",
         ALTER COLUMN "id_activity" SET NOT NULL`,
    );
  }
}
