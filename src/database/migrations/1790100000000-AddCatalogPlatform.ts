import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Canonical catalog platform (P2/P3).
 *
 * - `place` and `activity` gain a stable slug, a lifecycle status and (for
 *   activities) independent eligibility flags. Existing rows are backfilled as
 *   published and eligible so current behaviour is preserved; stricter gates
 *   apply to what the catalog pipeline imports.
 * - `place` gains SmartPlan-owned coordinates.
 * - `activity_place` records where its coordinates came from and when cached
 *   Google content expires. Rows that were filled by the Google sync become a
 *   temporary provider cache instead of being treated as canonical data.
 * - Import batches, staging, change log, source links and versions.
 */
export class AddCatalogPlatform1790100000000 implements MigrationInterface {
  name = 'AddCatalogPlatform1790100000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "place"
      ADD COLUMN "latitude" numeric(9,6),
      ADD COLUMN "longitude" numeric(9,6),
      ADD COLUMN "slug" character varying(120),
      ADD COLUMN "status" character varying(12) NOT NULL DEFAULT 'published',
      ADD COLUMN "kind" character varying(40),
      ADD COLUMN "canonical_key" character varying(200),
      ADD COLUMN "discoverable" boolean NOT NULL DEFAULT true,
      ADD COLUMN "verified_at" TIMESTAMP WITH TIME ZONE`);
    await q.query(`ALTER TABLE "place"
      ADD CONSTRAINT "CHK_place_latitude" CHECK ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90),
      ADD CONSTRAINT "CHK_place_longitude" CHECK ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180),
      ADD CONSTRAINT "CHK_place_coordinates_pair" CHECK (("latitude" IS NULL AND "longitude" IS NULL) OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL)),
      ADD CONSTRAINT "CHK_place_status" CHECK ("status" IN ('draft','in_review','published','archived'))`);
    await q.query(
      `CREATE UNIQUE INDEX "IDX_place_slug" ON "place" ("slug") WHERE "slug" IS NOT NULL AND "deleted_at" IS NULL`,
    );
    await q.query(
      `CREATE INDEX "IDX_place_canonical_key" ON "place" ("canonical_key")`,
    );

    await q.query(`ALTER TABLE "activity"
      ADD COLUMN "slug" character varying(120),
      ADD COLUMN "status" character varying(12) NOT NULL DEFAULT 'published',
      ADD COLUMN "discoverable" boolean NOT NULL DEFAULT true,
      ADD COLUMN "plan_eligible" boolean NOT NULL DEFAULT true,
      ADD COLUMN "auto_recommend_eligible" boolean NOT NULL DEFAULT true,
      ADD COLUMN "eligibility_reasons" jsonb,
      ADD COLUMN "verified_at" TIMESTAMP WITH TIME ZONE`);
    await q.query(
      `ALTER TABLE "activity" ADD CONSTRAINT "CHK_activity_status" CHECK ("status" IN ('draft','in_review','published','archived'))`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "IDX_activity_slug" ON "activity" ("slug") WHERE "slug" IS NOT NULL AND "deleted_at" IS NULL`,
    );
    await q.query(
      `CREATE INDEX "IDX_activity_listing" ON "activity" ("status", "discoverable") WHERE "deleted_at" IS NULL`,
    );

    await q.query(`ALTER TABLE "activity_place"
      ADD COLUMN "coordinates_source" character varying(20),
      ADD COLUMN "external_fetched_at" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN "external_expires_at" TIMESTAMP WITH TIME ZONE`);
    // Coordinates that came through the Google sync are a provider cache, not
    // canonical data. They keep working (nothing is nulled here) but now carry
    // an expiry; the sync refreshes them and the purge removes stale ones.
    await q.query(`UPDATE "activity_place" SET
        "coordinates_source" = 'GOOGLE_CACHE',
        "external_fetched_at" = "updated_at",
        "external_expires_at" = "updated_at" + interval '28 days'
      WHERE "google_place_id" IS NOT NULL
        AND ("latitude" IS NOT NULL OR "external_rating" IS NOT NULL)`);
    await q.query(`UPDATE "activity_place" SET "coordinates_source" = 'OWNED'
      WHERE "coordinates_source" IS NULL AND "latitude" IS NOT NULL`);

    await q.query(
      `CREATE INDEX "IDX_external_data_usage_context_used_at" ON "external_data_usage" ("context", "used_at")`,
    );

    await q.query(`CREATE TABLE "catalog_version" (
      "id" SERIAL NOT NULL,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "deleted_at" TIMESTAMP WITH TIME ZONE,
      "number" integer NOT NULL,
      "name" character varying(150) NOT NULL,
      "status" character varying(12) NOT NULL DEFAULT 'draft',
      "content_hash" character varying(64),
      "counts" jsonb,
      "parent_number" integer,
      "promoted_at" TIMESTAMP WITH TIME ZONE,
      "notes" text,
      CONSTRAINT "PK_catalog_version" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_catalog_version_status" CHECK ("status" IN ('draft','validated','promoted'))
    )`);
    await q.query(
      `CREATE UNIQUE INDEX "IDX_catalog_version_number" ON "catalog_version" ("number") WHERE "deleted_at" IS NULL`,
    );

    await q.query(`CREATE TABLE "catalog_import_batch" (
      "id" SERIAL NOT NULL,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "deleted_at" TIMESTAMP WITH TIME ZONE,
      "source" character varying(60) NOT NULL,
      "license_class" character varying(20) NOT NULL,
      "dry_run" boolean NOT NULL DEFAULT false,
      "status" character varying(12) NOT NULL DEFAULT 'running',
      "input_hash" character varying(64),
      "stats" jsonb,
      "version_number" integer,
      "started_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "ended_at" TIMESTAMP WITH TIME ZONE,
      "error_message" text,
      CONSTRAINT "PK_catalog_import_batch" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_catalog_import_batch_status" CHECK ("status" IN ('running','completed','failed'))
    )`);
    await q.query(
      `CREATE INDEX "IDX_catalog_import_batch_source" ON "catalog_import_batch" ("source")`,
    );

    await q.query(`CREATE TABLE "catalog_staging_record" (
      "id" SERIAL NOT NULL,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "deleted_at" TIMESTAMP WITH TIME ZONE,
      "id_batch" integer NOT NULL,
      "entity_type" character varying(12) NOT NULL,
      "external_key" character varying(160) NOT NULL,
      "payload" jsonb NOT NULL,
      "payload_hash" character varying(64) NOT NULL,
      "status" character varying(14) NOT NULL DEFAULT 'new',
      "notes" jsonb,
      "applied_entity_id" integer,
      CONSTRAINT "PK_catalog_staging_record" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_catalog_staging_record_type" CHECK ("entity_type" IN ('place','activity')),
      CONSTRAINT "CHK_catalog_staging_record_status" CHECK ("status" IN ('new','updated','unchanged','needs_review','rejected','applied'))
    )`);
    await q.query(
      `CREATE UNIQUE INDEX "IDX_catalog_staging_record_batch_key" ON "catalog_staging_record" ("id_batch", "entity_type", "external_key") WHERE "deleted_at" IS NULL`,
    );
    await q.query(
      `ALTER TABLE "catalog_staging_record" ADD CONSTRAINT "FK_catalog_staging_record_batch" FOREIGN KEY ("id_batch") REFERENCES "catalog_import_batch"("id") ON DELETE CASCADE`,
    );

    await q.query(`CREATE TABLE "catalog_change_log" (
      "id" SERIAL NOT NULL,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "deleted_at" TIMESTAMP WITH TIME ZONE,
      "id_batch" integer NOT NULL,
      "entity_type" character varying(12) NOT NULL,
      "entity_id" integer NOT NULL,
      "operation" character varying(10) NOT NULL,
      "before" jsonb,
      "after" jsonb,
      CONSTRAINT "PK_catalog_change_log" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_catalog_change_log_operation" CHECK ("operation" IN ('create','update','archive'))
    )`);
    await q.query(
      `CREATE INDEX "IDX_catalog_change_log_batch" ON "catalog_change_log" ("id_batch")`,
    );
    await q.query(
      `CREATE INDEX "IDX_catalog_change_log_entity" ON "catalog_change_log" ("entity_type", "entity_id")`,
    );

    await q.query(`CREATE TABLE "entity_source_link" (
      "id" SERIAL NOT NULL,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "deleted_at" TIMESTAMP WITH TIME ZONE,
      "entity_type" character varying(12) NOT NULL,
      "entity_id" integer NOT NULL,
      "source" character varying(60) NOT NULL,
      "external_id" character varying(255) NOT NULL,
      "license_class" character varying(20) NOT NULL,
      "match_confidence" numeric(3,2),
      "last_seen_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_entity_source_link" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_entity_source_link_type" CHECK ("entity_type" IN ('place','activity'))
    )`);
    await q.query(
      `CREATE INDEX "IDX_entity_source_link_entity" ON "entity_source_link" ("entity_type", "entity_id")`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "IDX_entity_source_link_external" ON "entity_source_link" ("entity_type", "source", "external_id") WHERE "deleted_at" IS NULL`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "IDX_external_data_usage_context_used_at"`);
    await q.query(`DROP TABLE "entity_source_link"`);
    await q.query(`DROP TABLE "catalog_change_log"`);
    await q.query(`DROP TABLE "catalog_staging_record"`);
    await q.query(`DROP TABLE "catalog_import_batch"`);
    await q.query(`DROP TABLE "catalog_version"`);
    await q.query(`ALTER TABLE "activity_place"
      DROP COLUMN "external_expires_at",
      DROP COLUMN "external_fetched_at",
      DROP COLUMN "coordinates_source"`);
    await q.query(`DROP INDEX "IDX_activity_listing"`);
    await q.query(`DROP INDEX "IDX_activity_slug"`);
    await q.query(`ALTER TABLE "activity"
      DROP CONSTRAINT "CHK_activity_status",
      DROP COLUMN "verified_at",
      DROP COLUMN "eligibility_reasons",
      DROP COLUMN "auto_recommend_eligible",
      DROP COLUMN "plan_eligible",
      DROP COLUMN "discoverable",
      DROP COLUMN "status",
      DROP COLUMN "slug"`);
    await q.query(`DROP INDEX "IDX_place_canonical_key"`);
    await q.query(`DROP INDEX "IDX_place_slug"`);
    await q.query(`ALTER TABLE "place"
      DROP CONSTRAINT "CHK_place_status",
      DROP CONSTRAINT "CHK_place_coordinates_pair",
      DROP CONSTRAINT "CHK_place_longitude",
      DROP CONSTRAINT "CHK_place_latitude",
      DROP COLUMN "verified_at",
      DROP COLUMN "discoverable",
      DROP COLUMN "canonical_key",
      DROP COLUMN "kind",
      DROP COLUMN "status",
      DROP COLUMN "slug",
      DROP COLUMN "longitude",
      DROP COLUMN "latitude"`);
  }
}
