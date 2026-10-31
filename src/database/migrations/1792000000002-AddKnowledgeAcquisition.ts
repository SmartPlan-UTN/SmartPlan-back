import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Knowledge acquisition: the official sources of each venue (with identity
 * verification state and refresh schedule), the normalized facts read from
 * them (append-only, with provenance and expiry), and the revalidation queue
 * fed by failures, changes, user reports and spend divergence. Additive.
 */
export class AddKnowledgeAcquisition1792000000002 implements MigrationInterface {
  name = 'AddKnowledgeAcquisition1792000000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "place_source" (
      "id" SERIAL NOT NULL PRIMARY KEY,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "deleted_at" timestamptz,
      "id_place" integer NOT NULL REFERENCES "place"("id") ON DELETE CASCADE,
      "kind" varchar(20) NOT NULL,
      "url" varchar(500) NOT NULL,
      "discovered_via" varchar(30) NOT NULL,
      "identity_status" varchar(20) NOT NULL DEFAULT 'CANDIDATE',
      "identity_signals" jsonb NOT NULL DEFAULT '[]',
      "last_fetched_at" timestamptz,
      "last_status" varchar(40),
      "content_hash" varchar(64),
      "next_check_at" timestamptz,
      "failure_count" integer NOT NULL DEFAULT 0,
      CONSTRAINT "CHK_place_source_kind" CHECK ("kind" IN ('OFFICIAL_SITE','MENU_PAGE','MENU_PDF','BOOKING_PROVIDER','LINK_HUB')),
      CONSTRAINT "CHK_place_source_identity" CHECK ("identity_status" IN ('CANDIDATE','VERIFIED','NOT_BRANCH','UNCONFIRMED','REJECTED'))
    )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_place_source_url" ON "place_source" ("id_place", "url") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_place_source_next_check" ON "place_source" ("next_check_at")`,
    );

    await queryRunner.query(`CREATE TABLE "place_fact_observation" (
      "id" SERIAL NOT NULL PRIMARY KEY,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "deleted_at" timestamptz,
      "id_place" integer NOT NULL REFERENCES "place"("id") ON DELETE CASCADE,
      "kind" varchar(30) NOT NULL,
      "value" jsonb NOT NULL,
      "method" varchar(30) NOT NULL,
      "source_url" varchar(500) NOT NULL,
      "evidence" varchar(300),
      "observed_at" timestamptz NOT NULL,
      "expires_at" timestamptz NOT NULL,
      "content_hash" varchar(64) NOT NULL,
      CONSTRAINT "CHK_place_fact_observation_kind" CHECK ("kind" IN ('HOURS','PRICE_RANGE','CUISINE','SERVES_MEAL','ACCEPTS_RESERVATIONS','DESCRIPTION_EVIDENCE','MENU_REVIEW')),
      CONSTRAINT "CHK_place_fact_observation_dates" CHECK ("expires_at" > "observed_at")
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_place_fact_observation_place" ON "place_fact_observation" ("id_place", "kind", "observed_at")`,
    );

    await queryRunner.query(`CREATE TABLE "knowledge_revalidation" (
      "id" SERIAL NOT NULL PRIMARY KEY,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "deleted_at" timestamptz,
      "id_place" integer NOT NULL REFERENCES "place"("id") ON DELETE CASCADE,
      "reason" varchar(30) NOT NULL,
      "priority" smallint NOT NULL DEFAULT 3,
      "status" varchar(12) NOT NULL DEFAULT 'PENDING',
      "signal_count" integer NOT NULL DEFAULT 1,
      "payload" jsonb,
      "resolved_at" timestamptz,
      "resolution" varchar(200),
      CONSTRAINT "CHK_knowledge_revalidation_reason" CHECK ("reason" IN ('EXPIRED','FETCH_FAILED','CONTENT_CHANGED','NEEDS_DURABLE_HOURS','NEEDS_DURABLE_LOCATION','USER_REPORT_CLOSED','USER_REPORT_HOURS','USER_REPORT_PRICE','USER_REPORT_UNAVAILABLE','SPEND_DIVERGENCE')),
      CONSTRAINT "CHK_knowledge_revalidation_status" CHECK ("status" IN ('PENDING','DONE','UNRESOLVED'))
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_knowledge_revalidation_queue" ON "knowledge_revalidation" ("status", "priority", "created_at")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_knowledge_revalidation_open" ON "knowledge_revalidation" ("id_place", "reason") WHERE "deleted_at" IS NULL AND "status" = 'PENDING'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "knowledge_revalidation"');
    await queryRunner.query('DROP TABLE "place_fact_observation"');
    await queryRunner.query('DROP TABLE "place_source"');
  }
}
