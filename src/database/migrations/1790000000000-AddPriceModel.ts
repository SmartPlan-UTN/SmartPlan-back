import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Price model (P1): UNKNOWN is a real state, never a zero.
 *
 * - `activity` gains price kind/min/max/unit/currency/source/ref/verified_at and
 *   `estimated_cost` becomes nullable (NULL = UNKNOWN).
 * - `plan_detail` gains an immutable price snapshot (same fields + snapshot_at).
 * - `plan` totals become a range with completeness and an unpriced counter.
 *
 * Legacy backfill is deliberately conservative: a positive amount becomes a
 * FIXED/LEGACY price of unspecified unit (it was always added as-is), and a
 * stored `0` becomes UNKNOWN because zero was also the only way to express
 * "no price" and there is no positive evidence that it was free.
 */
export class AddPriceModel1790000000000 implements MigrationInterface {
  name = 'AddPriceModel1790000000000';

  async up(q: QueryRunner): Promise<void> {
    await dropEstimatedCostChecks(q, 'activity', 'estimated_cost');
    await dropEstimatedCostChecks(q, 'plan_detail', 'estimated_cost');
    await dropEstimatedCostChecks(q, 'plan', 'estimated_total_cost');

    // ---- activity -------------------------------------------------------
    await q.query(`ALTER TABLE "activity"
      ALTER COLUMN "estimated_cost" DROP NOT NULL,
      ADD COLUMN "price_kind" character varying(10) NOT NULL DEFAULT 'UNKNOWN',
      ADD COLUMN "price_min" numeric(10,2),
      ADD COLUMN "price_max" numeric(10,2),
      ADD COLUMN "price_unit" character varying(20),
      ADD COLUMN "price_currency" character varying(3) NOT NULL DEFAULT 'ARS',
      ADD COLUMN "price_source" character varying(20),
      ADD COLUMN "price_source_ref" character varying(500),
      ADD COLUMN "price_verified_at" TIMESTAMP WITH TIME ZONE`);
    await q.query(`UPDATE "activity" SET
        "price_kind" = 'FIXED', "price_min" = "estimated_cost",
        "price_max" = "estimated_cost", "price_unit" = 'UNSPECIFIED',
        "price_source" = 'LEGACY'
      WHERE "estimated_cost" > 0`);
    await q.query(
      `UPDATE "activity" SET "estimated_cost" = NULL WHERE "price_kind" = 'UNKNOWN'`,
    );
    await q.query(`ALTER TABLE "activity"
      ADD CONSTRAINT "CHK_activity_estimated_cost" CHECK ("estimated_cost" IS NULL OR "estimated_cost" >= 0),
      ADD CONSTRAINT "CHK_activity_price_kind" CHECK ("price_kind" IN ('FREE','FIXED','FROM','RANGE','UNKNOWN')),
      ADD CONSTRAINT "CHK_activity_price_shape" CHECK (
        ("price_kind" = 'UNKNOWN' AND "price_min" IS NULL AND "price_max" IS NULL AND "estimated_cost" IS NULL AND "price_source" IS NULL) OR
        ("price_kind" = 'FREE' AND "price_min" = 0 AND "price_max" = 0 AND "estimated_cost" = 0 AND "price_source" IS NOT NULL AND "price_source" NOT IN ('PROVIDER_HINT','LEGACY')) OR
        ("price_kind" = 'FIXED' AND "price_min" IS NOT NULL AND "price_max" = "price_min" AND "estimated_cost" = "price_min" AND "price_source" IS NOT NULL) OR
        ("price_kind" = 'FROM' AND "price_min" IS NOT NULL AND "price_max" IS NULL AND "estimated_cost" = "price_min" AND "price_source" IS NOT NULL) OR
        ("price_kind" = 'RANGE' AND "price_min" IS NOT NULL AND "price_max" > "price_min" AND "estimated_cost" = "price_min" AND "price_source" IS NOT NULL))`);

    // ---- plan_detail (snapshot) ----------------------------------------
    await q.query(`ALTER TABLE "plan_detail"
      ALTER COLUMN "estimated_cost" DROP NOT NULL,
      ALTER COLUMN "estimated_cost" DROP DEFAULT,
      ADD COLUMN "price_kind" character varying(10) NOT NULL DEFAULT 'UNKNOWN',
      ADD COLUMN "price_min" numeric(10,2),
      ADD COLUMN "price_max" numeric(10,2),
      ADD COLUMN "price_unit" character varying(20),
      ADD COLUMN "price_currency" character varying(3) NOT NULL DEFAULT 'ARS',
      ADD COLUMN "price_source" character varying(20),
      ADD COLUMN "price_source_ref" character varying(500),
      ADD COLUMN "price_verified_at" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN "price_snapshot_at" TIMESTAMP WITH TIME ZONE`);
    await q.query(`UPDATE "plan_detail" SET
        "price_kind" = 'FIXED', "price_min" = "estimated_cost",
        "price_max" = "estimated_cost", "price_unit" = 'UNSPECIFIED',
        "price_source" = 'LEGACY', "price_snapshot_at" = "created_at"
      WHERE "estimated_cost" > 0`);
    await q.query(
      `UPDATE "plan_detail" SET "estimated_cost" = NULL, "price_snapshot_at" = "created_at" WHERE "price_kind" = 'UNKNOWN'`,
    );
    await q.query(`ALTER TABLE "plan_detail"
      ADD CONSTRAINT "CHK_plan_detail_estimated_cost" CHECK ("estimated_cost" IS NULL OR "estimated_cost" >= 0),
      ADD CONSTRAINT "CHK_plan_detail_price_kind" CHECK ("price_kind" IN ('FREE','FIXED','FROM','RANGE','UNKNOWN')),
      ADD CONSTRAINT "CHK_plan_detail_price_shape" CHECK (
        ("price_kind" = 'UNKNOWN' AND "price_min" IS NULL AND "price_max" IS NULL AND "estimated_cost" IS NULL) OR
        ("price_kind" = 'FREE' AND "price_min" = 0 AND "price_max" = 0 AND "estimated_cost" = 0) OR
        ("price_kind" IN ('FIXED','FROM','RANGE') AND "price_min" IS NOT NULL AND "estimated_cost" = "price_min"))`);

    // ---- plan totals ----------------------------------------------------
    await q.query(`ALTER TABLE "plan"
      ALTER COLUMN "estimated_total_cost" DROP NOT NULL,
      ALTER COLUMN "estimated_total_cost" DROP DEFAULT,
      ADD COLUMN "estimated_total_cost_max" numeric(10,2),
      ADD COLUMN "unpriced_count" integer NOT NULL DEFAULT 0,
      ADD COLUMN "price_completeness" character varying(12) NOT NULL DEFAULT 'EXACT'`);
    // Every legacy detail with a positive amount is FIXED, so a plan is either
    // fully priced (EXACT), partly priced (PARTIAL) or not priced at all (NONE).
    await q.query(`UPDATE "plan" p SET
        "unpriced_count" = s.unpriced,
        "estimated_total_cost" = CASE WHEN s.priced = 0 THEN NULL ELSE p."estimated_total_cost" END,
        "estimated_total_cost_max" = CASE WHEN s.priced = 0 OR s.unpriced > 0 THEN NULL ELSE p."estimated_total_cost" END,
        "price_completeness" = CASE
          WHEN s.priced = 0 THEN 'NONE'
          WHEN s.unpriced > 0 THEN 'PARTIAL'
          ELSE 'EXACT' END
      FROM (
        SELECT d."id_plan",
               count(*) FILTER (WHERE d."price_kind" <> 'UNKNOWN') AS priced,
               count(*) FILTER (WHERE d."price_kind" = 'UNKNOWN') AS unpriced
        FROM "plan_detail" d WHERE d."deleted_at" IS NULL GROUP BY d."id_plan"
      ) s WHERE s."id_plan" = p."id"`);
    // Plans with no details keep EXACT 0/0.
    await q.query(
      `UPDATE "plan" SET "estimated_total_cost_max" = "estimated_total_cost" WHERE "price_completeness" = 'EXACT' AND "estimated_total_cost_max" IS NULL`,
    );
    await q.query(`ALTER TABLE "plan"
      ADD CONSTRAINT "CHK_plan_estimated_total_cost" CHECK ("estimated_total_cost" IS NULL OR "estimated_total_cost" >= 0),
      ADD CONSTRAINT "CHK_plan_price_completeness" CHECK ("price_completeness" IN ('EXACT','RANGE','LOWER_BOUND','PARTIAL','NONE'))`);
  }

  async down(q: QueryRunner): Promise<void> {
    // Lossy by nature: UNKNOWN returns to 0, the very ambiguity this migration
    // removed. Use only to roll back before new data has been curated.
    await q.query(`ALTER TABLE "plan"
      DROP CONSTRAINT "CHK_plan_price_completeness",
      DROP CONSTRAINT "CHK_plan_estimated_total_cost"`);
    await q.query(
      `UPDATE "plan" SET "estimated_total_cost" = 0 WHERE "estimated_total_cost" IS NULL`,
    );
    await q.query(`ALTER TABLE "plan"
      DROP COLUMN "price_completeness",
      DROP COLUMN "unpriced_count",
      DROP COLUMN "estimated_total_cost_max",
      ALTER COLUMN "estimated_total_cost" SET DEFAULT 0,
      ALTER COLUMN "estimated_total_cost" SET NOT NULL,
      ADD CONSTRAINT "CHK_plan_estimated_total_cost_legacy" CHECK ("estimated_total_cost" >= 0)`);

    await q.query(`ALTER TABLE "plan_detail"
      DROP CONSTRAINT "CHK_plan_detail_price_shape",
      DROP CONSTRAINT "CHK_plan_detail_price_kind",
      DROP CONSTRAINT "CHK_plan_detail_estimated_cost"`);
    await q.query(
      `UPDATE "plan_detail" SET "estimated_cost" = 0 WHERE "estimated_cost" IS NULL`,
    );
    await q.query(`ALTER TABLE "plan_detail"
      DROP COLUMN "price_snapshot_at", DROP COLUMN "price_verified_at",
      DROP COLUMN "price_source_ref", DROP COLUMN "price_source",
      DROP COLUMN "price_currency", DROP COLUMN "price_unit",
      DROP COLUMN "price_max", DROP COLUMN "price_min", DROP COLUMN "price_kind",
      ALTER COLUMN "estimated_cost" SET DEFAULT 0,
      ALTER COLUMN "estimated_cost" SET NOT NULL,
      ADD CONSTRAINT "CHK_plan_detail_estimated_cost_legacy" CHECK ("estimated_cost" >= 0)`);

    await q.query(`ALTER TABLE "activity"
      DROP CONSTRAINT "CHK_activity_price_shape",
      DROP CONSTRAINT "CHK_activity_price_kind",
      DROP CONSTRAINT "CHK_activity_estimated_cost"`);
    await q.query(
      `UPDATE "activity" SET "estimated_cost" = 0 WHERE "estimated_cost" IS NULL`,
    );
    await q.query(`ALTER TABLE "activity"
      DROP COLUMN "price_verified_at", DROP COLUMN "price_source_ref",
      DROP COLUMN "price_source", DROP COLUMN "price_currency",
      DROP COLUMN "price_unit", DROP COLUMN "price_max",
      DROP COLUMN "price_min", DROP COLUMN "price_kind",
      ALTER COLUMN "estimated_cost" SET NOT NULL,
      ADD CONSTRAINT "CHK_activity_estimated_cost_legacy" CHECK ("estimated_cost" >= 0)`);
  }
}

/** Drops the legacy auto-named `col >= 0` CHECK, whatever its hash name. */
async function dropEstimatedCostChecks(
  q: QueryRunner,
  table: string,
  column: string,
): Promise<void> {
  const rows = (await q.query(
    `SELECT con.conname FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
      WHERE rel.relname = $1 AND con.contype = 'c'
        AND pg_get_constraintdef(con.oid) LIKE $2`,
    [table, `%"${column}" >= 0%`],
  )) as Array<{ conname: string }>;
  for (const { conname } of rows) {
    await q.query(`ALTER TABLE "${table}" DROP CONSTRAINT "${conname}"`);
  }
}
