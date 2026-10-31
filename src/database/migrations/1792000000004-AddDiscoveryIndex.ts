import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Broad discovery: an ODbL layer of OpenStreetMap features (separate, with
 * provenance and licence), the Google Place ID discovery index (IDs only),
 * and the identity provenance of each Place.
 */
export class AddDiscoveryIndex1792000000004 implements MigrationInterface {
  name = 'AddDiscoveryIndex1792000000004';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "odbl_feature" (
      "id" SERIAL NOT NULL PRIMARY KEY,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "deleted_at" timestamptz,
      "osm_type" varchar(10) NOT NULL,
      "osm_id" bigint NOT NULL,
      "osm_version" integer,
      "osm_timestamp" timestamptz,
      "name" varchar(200) NOT NULL,
      "latitude" numeric(9,6) NOT NULL,
      "longitude" numeric(9,6) NOT NULL,
      "tags" jsonb NOT NULL,
      "license" varchar(20) NOT NULL DEFAULT 'ODbL-1.0',
      "attribution" varchar(120) NOT NULL DEFAULT '© OpenStreetMap contributors',
      "snapshot_at" timestamptz NOT NULL,
      "id_place" integer REFERENCES "place"("id") ON DELETE SET NULL,
      "match_status" varchar(12) NOT NULL,
      "match_note" varchar(200),
      CONSTRAINT "CHK_odbl_feature_type" CHECK ("osm_type" IN ('node','way','relation')),
      CONSTRAINT "CHK_odbl_feature_status" CHECK ("match_status" IN ('CREATED','LINKED','DUPLICATE','SKIPPED'))
    )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_odbl_feature_element" ON "odbl_feature" ("osm_type", "osm_id") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_odbl_feature_place" ON "odbl_feature" ("id_place")`,
    );
    await queryRunner.query(`CREATE TABLE "google_place_discovery" (
      "id" SERIAL NOT NULL PRIMARY KEY,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "deleted_at" timestamptz,
      "google_place_id" varchar(255) NOT NULL,
      "first_seen_at" timestamptz NOT NULL,
      "last_seen_at" timestamptz NOT NULL,
      "hits" integer NOT NULL DEFAULT 0,
      "cells" text[] NOT NULL DEFAULT '{}',
      "id_place" integer REFERENCES "place"("id") ON DELETE SET NULL,
      "resolution" varchar(24) NOT NULL DEFAULT 'UNRESOLVED',
      "resolution_method" varchar(60),
      "confidence" numeric(3,2),
      "resolved_at" timestamptz,
      CONSTRAINT "CHK_google_place_discovery_resolution" CHECK ("resolution" IN ('UNRESOLVED','LINKED','NO_DURABLE_IDENTITY','AMBIGUOUS'))
    )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_google_place_discovery_id" ON "google_place_discovery" ("google_place_id") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_google_place_discovery_place" ON "google_place_discovery" ("id_place")`,
    );
    await queryRunner.query(
      `ALTER TABLE "place" ADD "identity_source" varchar(20) NOT NULL DEFAULT 'SMARTPLAN'`,
    );
    await queryRunner.query(
      `ALTER TABLE "place" ADD CONSTRAINT "CHK_place_identity_source" CHECK ("identity_source" IN ('SMARTPLAN','OSM_ODBL'))`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "place" DROP CONSTRAINT "CHK_place_identity_source"',
    );
    await queryRunner.query(
      'ALTER TABLE "place" DROP COLUMN "identity_source"',
    );
    await queryRunner.query('DROP TABLE "google_place_discovery"');
    await queryRunner.query('DROP TABLE "odbl_feature"');
  }
}
