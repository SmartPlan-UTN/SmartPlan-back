import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Google identity and its temporary cache belong to the PLACE, not to each
 * activity-place link: a place can now be explored on its own (with or
 * without activities) and one physical place costs one provider lookup.
 *
 * - `place.google_place_id` (persistable identity) and a temporary cache
 *   (rating, place-level price, coordinates, business status) with one expiry.
 * - Existing link caches are copied to their place, then the link keeps only
 *   its effective coordinates (owned, or a copy of the place cache with the
 *   same expiry); the duplicated rating/price/identity columns are dropped.
 * - An open-licensed image reference on the place (URL + licence + author),
 *   and where its canonical coordinates come from (`coordinates_ref`).
 * - `activity.available_months` for seasonal activities (1-12, NULL = always).
 * - Legacy free-text activity types and place kinds are mapped to the
 *   controlled vocabularies in `src/catalog/taxonomy.ts`.
 * - The "Wine tourism" and "Adventure" categories.
 */
export class AddPlaceProviderCacheAndTaxonomy1790500000000 implements MigrationInterface {
  name = 'AddPlaceProviderCacheAndTaxonomy1790500000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "place"
      ADD COLUMN "google_place_id" character varying(255),
      ADD COLUMN "external_rating" numeric(2,1),
      ADD COLUMN "external_rating_count" integer,
      ADD COLUMN "external_price_min" numeric(12,2),
      ADD COLUMN "external_price_max" numeric(12,2),
      ADD COLUMN "external_price_currency" character varying(3),
      ADD COLUMN "external_price_level" character varying(40),
      ADD COLUMN "external_latitude" numeric(9,6),
      ADD COLUMN "external_longitude" numeric(9,6),
      ADD COLUMN "external_business_status" character varying(40),
      ADD COLUMN "external_fetched_at" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN "external_expires_at" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN "image_url" character varying(500),
      ADD COLUMN "image_license" character varying(80),
      ADD COLUMN "image_author" character varying(200),
      ADD COLUMN "image_source_url" character varying(500),
      ADD COLUMN "coordinates_ref" character varying(500)`);
    await q.query(
      `CREATE INDEX "IDX_place_google_place_id" ON "place" ("google_place_id")`,
    );
    await q.query(
      `ALTER TABLE "place" ADD CONSTRAINT "CHK_place_external_price_order" CHECK ("external_price_min" IS NULL OR "external_price_max" IS NULL OR "external_price_min" <= "external_price_max")`,
    );
    await q.query(
      `ALTER TABLE "place" ADD CONSTRAINT "CHK_place_external_coordinates_pair" CHECK (("external_latitude" IS NULL AND "external_longitude" IS NULL) OR ("external_latitude" IS NOT NULL AND "external_longitude" IS NOT NULL))`,
    );

    // Identity: the reviewed catalog link first, then whatever a link had.
    await q.query(`UPDATE "place" "p" SET "google_place_id" = "l"."external_id"
      FROM "entity_source_link" "l"
      WHERE "l"."entity_type" = 'place' AND "l"."entity_id" = "p"."id"
        AND "l"."source" = 'google-places' AND "l"."deleted_at" IS NULL`);
    await q.query(`UPDATE "place" "p" SET "google_place_id" = "src"."google_place_id"
      FROM (
        SELECT DISTINCT ON ("id_place") "id_place", "google_place_id"
        FROM "activity_place"
        WHERE "google_place_id" IS NOT NULL AND "deleted_at" IS NULL
        ORDER BY "id_place", "external_fetched_at" DESC NULLS LAST, "id"
      ) "src"
      WHERE "src"."id_place" = "p"."id" AND "p"."google_place_id" IS NULL`);

    // Cache: the freshest unexpired link cache of each place.
    await q.query(`UPDATE "place" "p" SET
        "external_rating" = "src"."external_rating",
        "external_rating_count" = "src"."external_rating_count",
        "external_price_min" = "src"."external_price_min",
        "external_price_max" = "src"."external_price_max",
        "external_price_currency" = "src"."external_price_currency",
        "external_price_level" = "src"."external_price_level",
        "external_latitude" = "src"."cache_latitude",
        "external_longitude" = "src"."cache_longitude",
        "external_fetched_at" = "src"."external_fetched_at",
        "external_expires_at" = "src"."external_expires_at"
      FROM (
        SELECT DISTINCT ON ("id_place") "id_place",
          "external_rating", "external_rating_count",
          "external_price_min", "external_price_max",
          "external_price_currency", "external_price_level",
          CASE WHEN "coordinates_source" = 'GOOGLE_CACHE' THEN "latitude" END AS "cache_latitude",
          CASE WHEN "coordinates_source" = 'GOOGLE_CACHE' THEN "longitude" END AS "cache_longitude",
          "external_fetched_at", "external_expires_at"
        FROM "activity_place"
        WHERE "external_expires_at" > now() AND "deleted_at" IS NULL
        ORDER BY "id_place", "external_fetched_at" DESC NULLS LAST, "id"
      ) "src"
      WHERE "src"."id_place" = "p"."id"`);

    await q.query(
      `ALTER TABLE "activity_place" DROP CONSTRAINT IF EXISTS "CHK_activity_place_external_price_order"`,
    );
    await q.query(`DROP INDEX IF EXISTS "IDX_activity_place_google_place_id"`);
    await q.query(`ALTER TABLE "activity_place"
      DROP COLUMN "google_place_id",
      DROP COLUMN "external_rating",
      DROP COLUMN "external_rating_count",
      DROP COLUMN "external_price_min",
      DROP COLUMN "external_price_max",
      DROP COLUMN "external_price_currency",
      DROP COLUMN "external_price_level"`);

    await q.query(
      `ALTER TABLE "activity" ADD COLUMN "available_months" smallint[]`,
    );
    await q.query(
      `ALTER TABLE "activity" ADD CONSTRAINT "CHK_activity_available_months" CHECK ("available_months" IS NULL OR ("available_months" <@ ARRAY[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[] AND cardinality("available_months") > 0))`,
    );

    // Controlled vocabularies (see src/catalog/taxonomy.ts).
    await q.query(`UPDATE "activity" SET "type" = CASE
        translate(lower(trim("type")), 'áéíóúüñ', 'aeiouun')
        WHEN 'comida' THEN 'meal'
        WHEN 'gastronomy' THEN 'meal'
        WHEN 'gastronomia' THEN 'meal'
        WHEN 'visita a bodega' THEN 'winery_tour'
        WHEN 'experiencia en bodega' THEN 'winery_tour'
        WHEN 'degustacion' THEN 'tasting'
        WHEN 'rafting' THEN 'rafting'
        WHEN 'cabalgata' THEN 'horseback_riding'
        WHEN 'trekking' THEN 'trekking'
        WHEN 'senderismo' THEN 'trekking'
        WHEN 'salida' THEN 'drinks'
        WHEN 'bar' THEN 'drinks'
        WHEN 'museo' THEN 'museum_visit'
        WHEN 'culture' THEN 'guided_tour'
        WHEN 'cultura' THEN 'guided_tour'
        WHEN 'paseo urbano' THEN 'walk'
        WHEN 'paseo al aire libre' THEN 'walk'
        WHEN 'paseo' THEN 'walk'
        WHEN 'outdoors' THEN 'walk'
        WHEN 'excursion' THEN 'day_trip'
        WHEN 'mirador' THEN 'viewpoint_visit'
        WHEN 'mountain bike' THEN 'mountain_bike'
        WHEN 'escalada' THEN 'climbing'
        WHEN 'sitio historico' THEN 'heritage_visit'
        WHEN 'termas' THEN 'thermal_baths'
        WHEN 'paseo cultural' THEN 'guided_tour'
        WHEN 'esqui' THEN 'ski'
        WHEN 'espectaculo' THEN 'live_show'
        WHEN 'kayak' THEN 'kayak'
        WHEN 'parapente' THEN 'paragliding'
        WHEN 'canopy' THEN 'canopy'
        WHEN 'spa' THEN 'spa_treatment'
        ELSE "type" END
      WHERE "type" IS NOT NULL`);
    await q.query(`UPDATE "place" SET "kind" = CASE "kind"
        WHEN 'theater' THEN 'theatre'
        WHEN 'cafeteria' THEN 'cafe'
        WHEN 'spa_resort' THEN 'spa'
        ELSE "kind" END
      WHERE "kind" IS NOT NULL`);

    for (const [name, description] of [
      [
        'Wine tourism',
        'Bodegas, degustaciones, visitas guiadas y almuerzos entre viñedos.',
      ],
      [
        'Adventure',
        'Rafting, cabalgatas, trekking, canopy y otras actividades de aventura.',
      ],
    ]) {
      await q.query(
        `INSERT INTO "category" ("name", "description", "id_category_status")
         SELECT $1::varchar, $2::text, "s"."id" FROM "category_status" "s"
         WHERE "s"."key" = 'active' AND "s"."deleted_at" IS NULL
           AND NOT EXISTS (SELECT 1 FROM "category" "c" WHERE lower("c"."name") = lower($1::varchar))
         LIMIT 1`,
        [name, description],
      );
    }
  }

  async down(q: QueryRunner): Promise<void> {
    // Categories and vocabulary values are data: they stay (older code reads
    // them as plain text). Only the schema is reverted.
    await q.query(
      `ALTER TABLE "activity" DROP CONSTRAINT "CHK_activity_available_months"`,
    );
    await q.query(`ALTER TABLE "activity" DROP COLUMN "available_months"`);

    await q.query(`ALTER TABLE "activity_place"
      ADD COLUMN "google_place_id" character varying(255),
      ADD COLUMN "external_rating" numeric(2,1),
      ADD COLUMN "external_rating_count" integer,
      ADD COLUMN "external_price_min" numeric(12,2),
      ADD COLUMN "external_price_max" numeric(12,2),
      ADD COLUMN "external_price_currency" character varying(3),
      ADD COLUMN "external_price_level" character varying(40)`);
    await q.query(
      `CREATE INDEX "IDX_activity_place_google_place_id" ON "activity_place" ("google_place_id")`,
    );
    await q.query(
      `ALTER TABLE "activity_place" ADD CONSTRAINT "CHK_activity_place_external_price_order" CHECK ("external_price_min" IS NULL OR "external_price_max" IS NULL OR "external_price_min" <= "external_price_max")`,
    );
    await q.query(`UPDATE "activity_place" "ap" SET
        "google_place_id" = "p"."google_place_id",
        "external_rating" = "p"."external_rating",
        "external_rating_count" = "p"."external_rating_count",
        "external_price_min" = "p"."external_price_min",
        "external_price_max" = "p"."external_price_max",
        "external_price_currency" = "p"."external_price_currency",
        "external_price_level" = "p"."external_price_level"
      FROM "place" "p" WHERE "p"."id" = "ap"."id_place"`);

    await q.query(
      `ALTER TABLE "place" DROP CONSTRAINT "CHK_place_external_coordinates_pair"`,
    );
    await q.query(
      `ALTER TABLE "place" DROP CONSTRAINT "CHK_place_external_price_order"`,
    );
    await q.query(`DROP INDEX "IDX_place_google_place_id"`);
    await q.query(`ALTER TABLE "place"
      DROP COLUMN "coordinates_ref",
      DROP COLUMN "image_source_url",
      DROP COLUMN "image_author",
      DROP COLUMN "image_license",
      DROP COLUMN "image_url",
      DROP COLUMN "external_expires_at",
      DROP COLUMN "external_fetched_at",
      DROP COLUMN "external_business_status",
      DROP COLUMN "external_longitude",
      DROP COLUMN "external_latitude",
      DROP COLUMN "external_price_level",
      DROP COLUMN "external_price_currency",
      DROP COLUMN "external_price_max",
      DROP COLUMN "external_price_min",
      DROP COLUMN "external_rating_count",
      DROP COLUMN "external_rating",
      DROP COLUMN "google_place_id"`);
  }
}
