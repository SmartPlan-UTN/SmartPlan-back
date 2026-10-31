import { MigrationInterface, QueryRunner } from 'typeorm';
import { OCCASION_KEYS } from '../../catalog/taxonomy';

const CATALOG_REVIEW = {
  key: 'catalog.review',
  name: 'Review catalog candidates',
  description:
    'Review, edit, approve or discard proposed activities and places before they enter the catalog (RF44, CU50).',
  roles: ['admin'],
};

/**
 * Expanded catalog (RF43, RF44, CU49-CU51, #135):
 *
 * - `activity.occasions` (who it suits and its mood, GIN-indexed), plus
 *   `min_age`, `materials` and `rules_ref` for games at home.
 * - The virtual "Hogar": a single `place` with `kind = 'home'` and no
 *   department, coordinates or Google identity.
 * - `catalog_candidate`: the human review queue for proposed activities and
 *   places. The fingerprint is unique in every status, so a discarded
 *   proposal never comes back.
 * - `external_sync.details` / `period` for the monthly refresh, completed at
 *   most once per period.
 * - The `catalog.review` permission and the `gemini` provider, created where
 *   missing: the seed creates them too, but no deploy runs it.
 */
export class AddCatalogOccasionsHomeAndCandidates1792600000000 implements MigrationInterface {
  name = 'AddCatalogOccasionsHomeAndCandidates1792600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- activity -------------------------------------------------------
    await queryRunner.query(
      `ALTER TABLE "activity" ADD "occasions" text array NOT NULL DEFAULT '{}'::text[]`,
    );
    await queryRunner.query(`ALTER TABLE "activity" ADD "min_age" smallint`);
    await queryRunner.query(
      `ALTER TABLE "activity" ADD "materials" text array NOT NULL DEFAULT '{}'::text[]`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity" ADD "rules_ref" character varying(500)`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity" ADD CONSTRAINT "CHK_activity_occasions" CHECK ("occasions" <@ ARRAY[${OCCASION_KEYS.map((key) => `'${key}'`).join(',')}]::text[])`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity" ADD CONSTRAINT "CHK_activity_min_age" CHECK ("min_age" IS NULL OR "min_age" BETWEEN 0 AND 18)`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity" ADD CONSTRAINT "CHK_activity_materials" CHECK (cardinality("materials") <= 6)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_activity_occasions" ON "activity" USING GIN ("occasions")`,
    );

    // ---- place: the Hogar ----------------------------------------------
    await queryRunner.query(
      `ALTER TABLE "place" ALTER COLUMN "id_department" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "place" ADD CONSTRAINT "CHK_place_department" CHECK ("kind" = 'home' OR "id_department" IS NOT NULL)`,
    );
    await queryRunner.query(
      `ALTER TABLE "place" ADD CONSTRAINT "CHK_place_home_unlocated" CHECK ("kind" IS DISTINCT FROM 'home' OR ("latitude" IS NULL AND "google_place_id" IS NULL))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_place_single_home" ON "place" ("kind") WHERE "kind" = 'home' AND "deleted_at" IS NULL`,
    );

    // ---- external_sync -------------------------------------------------
    await queryRunner.query(`ALTER TABLE "external_sync" ADD "details" jsonb`);
    await queryRunner.query(
      `ALTER TABLE "external_sync" ADD "period" character varying(7)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_external_sync_completed_period" ON "external_sync" ("entity", "period") WHERE "entity" = 'catalog_refresh' AND "status" = 'completed' AND "deleted_at" IS NULL`,
    );

    // ---- catalog_candidate ----------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "catalog_candidate" (
        "id" SERIAL NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "entity_type" character varying(12) NOT NULL,
        "status" character varying(12) NOT NULL DEFAULT 'pending',
        "origin" character varying(20) NOT NULL,
        "id_place" integer,
        "payload" jsonb NOT NULL,
        "original_payload" jsonb NOT NULL,
        "source_refs" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "notes" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "fingerprint" character varying(64) NOT NULL,
        "id_external_sync" integer,
        "model" character varying(60),
        "discard_reason" character varying(500),
        "reviewed_by" integer,
        "reviewed_at" TIMESTAMP WITH TIME ZONE,
        "applied_entity_id" integer,
        CONSTRAINT "CHK_catalog_candidate_entity_type" CHECK ("entity_type" IN ('activity','place')),
        CONSTRAINT "CHK_catalog_candidate_status" CHECK ("status" IN ('pending','approved','discarded')),
        CONSTRAINT "CHK_catalog_candidate_origin" CHECK ("origin" IN ('initial_load','monthly_refresh','manual')),
        CONSTRAINT "CHK_catalog_candidate_discard_reason" CHECK ("status" <> 'discarded' OR "discard_reason" IS NOT NULL),
        CONSTRAINT "PK_catalog_candidate" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_catalog_candidate_queue" ON "catalog_candidate" ("status", "entity_type", "created_at")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_catalog_candidate_fingerprint" ON "catalog_candidate" ("fingerprint")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_catalog_candidate_place" ON "catalog_candidate" ("id_place")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_catalog_candidate_external_sync" ON "catalog_candidate" ("id_external_sync")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_catalog_candidate_reviewer" ON "catalog_candidate" ("reviewed_by")`,
    );
    await queryRunner.query(
      `ALTER TABLE "catalog_candidate" ADD CONSTRAINT "FK_1d0316f8975c903dcf4d4185710" FOREIGN KEY ("id_place") REFERENCES "place"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "catalog_candidate" ADD CONSTRAINT "FK_c1326ab288c8b20a14e65234252" FOREIGN KEY ("id_external_sync") REFERENCES "external_sync"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "catalog_candidate" ADD CONSTRAINT "FK_f2860d8ea2fda862a2f925102cf" FOREIGN KEY ("reviewed_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    // ---- seed values no deploy loads -------------------------------------
    await queryRunner.query(
      `
      INSERT INTO "permission" ("key", "name", "description")
      SELECT $1::varchar, $2::varchar, $3::varchar
      WHERE NOT EXISTS (
        SELECT 1 FROM "permission" WHERE "key" = $1::varchar AND "deleted_at" IS NULL
      )
    `,
      [CATALOG_REVIEW.key, CATALOG_REVIEW.name, CATALOG_REVIEW.description],
    );
    await queryRunner.query(
      `
      INSERT INTO "role_permission" ("id_role", "id_permission")
      SELECT "role"."id", "permission"."id"
      FROM "role", "permission"
      WHERE "role"."key" = ANY($2::text[])
        AND "role"."deleted_at" IS NULL
        AND "permission"."key" = $1::varchar
        AND "permission"."deleted_at" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "role_permission"
          WHERE "role_permission"."id_permission" = "permission"."id"
            AND "role_permission"."deleted_at" IS NULL
        )
    `,
      [CATALOG_REVIEW.key, CATALOG_REVIEW.roles],
    );
    await queryRunner.query(
      `
      INSERT INTO "external_provider" ("key", "name", "description")
      SELECT 'gemini', 'Gemini', 'Proposes catalog candidates in the monthly refresh (CU49, CU51).'
      WHERE NOT EXISTS (
        SELECT 1 FROM "external_provider" WHERE "key" = 'gemini' AND "deleted_at" IS NULL
      )
    `,
    );
  }

  /**
   * The permission and the provider stay: the seed creates them as well.
   * Refuses to run while the Hogar exists, because a place without a
   * department cannot go back under the NOT NULL constraint.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    const homes = (await queryRunner.query(
      `SELECT 1 FROM "place" WHERE "id_department" IS NULL LIMIT 1`,
    )) as unknown[];
    if (homes.length > 0)
      throw new Error(
        'Places without a department exist (the Hogar). Archive and remove them, with their activities, before reverting.',
      );
    await queryRunner.query(`DROP TABLE "catalog_candidate"`);
    await queryRunner.query(`DROP INDEX "IDX_external_sync_completed_period"`);
    await queryRunner.query(`ALTER TABLE "external_sync" DROP COLUMN "period"`);
    await queryRunner.query(
      `ALTER TABLE "external_sync" DROP COLUMN "details"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_place_single_home"`);
    await queryRunner.query(
      `ALTER TABLE "place" DROP CONSTRAINT "CHK_place_home_unlocated"`,
    );
    await queryRunner.query(
      `ALTER TABLE "place" DROP CONSTRAINT "CHK_place_department"`,
    );
    await queryRunner.query(
      `ALTER TABLE "place" ALTER COLUMN "id_department" SET NOT NULL`,
    );
    await queryRunner.query(`DROP INDEX "IDX_activity_occasions"`);
    await queryRunner.query(
      `ALTER TABLE "activity" DROP CONSTRAINT "CHK_activity_materials"`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity" DROP CONSTRAINT "CHK_activity_min_age"`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity" DROP CONSTRAINT "CHK_activity_occasions"`,
    );
    await queryRunner.query(`ALTER TABLE "activity" DROP COLUMN "rules_ref"`);
    await queryRunner.query(`ALTER TABLE "activity" DROP COLUMN "materials"`);
    await queryRunner.query(`ALTER TABLE "activity" DROP COLUMN "min_age"`);
    await queryRunner.query(`ALTER TABLE "activity" DROP COLUMN "occasions"`);
  }
}
