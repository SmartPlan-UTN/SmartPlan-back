import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-activity price observations reported by people after an outing, and the
 * history of prices that an observed estimate replaced. A plan-level actual
 * cost stays on the feedback and is never split across activities.
 */
export class AddActivityPriceObservations1790300000000 implements MigrationInterface {
  name = 'AddActivityPriceObservations1790300000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "activity_price_observation" (
      "id" SERIAL NOT NULL,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "deleted_at" TIMESTAMP WITH TIME ZONE,
      "id_activity" integer NOT NULL,
      "id_feedback" integer NOT NULL,
      "amount_reported" numeric(12,2) NOT NULL,
      "party_size" integer NOT NULL,
      "amount_per_person" numeric(12,2) NOT NULL,
      "currency" character varying(3) NOT NULL DEFAULT 'ARS',
      "observed_at" TIMESTAMP WITH TIME ZONE NOT NULL,
      CONSTRAINT "PK_activity_price_observation" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_activity_price_observation_amount" CHECK ("amount_per_person" > 0)
    )`);
    await q.query(
      `CREATE INDEX "IDX_activity_price_observation_activity" ON "activity_price_observation" ("id_activity", "observed_at")`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "UQ_activity_price_observation_feedback_activity" ON "activity_price_observation" ("id_feedback", "id_activity") WHERE "deleted_at" IS NULL`,
    );

    await q.query(`CREATE TABLE "activity_price_history" (
      "id" SERIAL NOT NULL,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "deleted_at" TIMESTAMP WITH TIME ZONE,
      "id_activity" integer NOT NULL,
      "price_kind" character varying(12) NOT NULL,
      "price_min" numeric(12,2),
      "price_max" numeric(12,2),
      "price_unit" character varying(16),
      "price_source" character varying(20),
      "price_source_ref" character varying(500),
      "price_verified_at" TIMESTAMP WITH TIME ZONE,
      "replaced_at" TIMESTAMP WITH TIME ZONE NOT NULL,
      "reason" character varying(40) NOT NULL,
      CONSTRAINT "PK_activity_price_history" PRIMARY KEY ("id")
    )`);
    await q.query(
      `CREATE INDEX "IDX_activity_price_history_activity" ON "activity_price_history" ("id_activity", "replaced_at")`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "activity_price_history"`);
    await q.query(`DROP TABLE "activity_price_observation"`);
  }
}
