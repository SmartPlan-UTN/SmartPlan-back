import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mendoza departments the catalog package did not declare, so places there
 * could not be loaded and `list_allowed_values` (MCP) did not offer them.
 * Data only, idempotent: country, city, and each department are inserted only
 * when missing (same `Argentina / Mendoza` geography the catalog import uses).
 */
export const MISSING_MENDOZA_DEPARTMENTS = [
  'Malargüe',
  'General Alvear',
  'Lavalle',
  'San Martín',
  'Junín',
  'Rivadavia',
];

export class AddMissingMendozaDepartments1793400000000 implements MigrationInterface {
  name = 'AddMissingMendozaDepartments1793400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "country" ("name")
      SELECT 'Argentina'
      WHERE NOT EXISTS (
        SELECT 1 FROM "country" WHERE "name" = 'Argentina' AND "deleted_at" IS NULL
      )
    `);
    await queryRunner.query(`
      INSERT INTO "city" ("name", "id_country")
      SELECT 'Mendoza', "country"."id"
      FROM "country"
      WHERE "country"."name" = 'Argentina' AND "country"."deleted_at" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "city"
          WHERE "city"."name" = 'Mendoza'
            AND "city"."id_country" = "country"."id"
            AND "city"."deleted_at" IS NULL
        )
    `);
    await queryRunner.query(
      `
      INSERT INTO "department" ("name", "id_city")
      SELECT "wanted"."name", "city"."id"
      FROM unnest($1::varchar[]) AS "wanted"("name")
      CROSS JOIN "city"
      JOIN "country" ON "country"."id" = "city"."id_country"
      WHERE "city"."name" = 'Mendoza' AND "city"."deleted_at" IS NULL
        AND "country"."name" = 'Argentina' AND "country"."deleted_at" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "department"
          WHERE "department"."id_city" = "city"."id"
            AND "department"."name" = "wanted"."name"
            AND "department"."deleted_at" IS NULL
        )
    `,
      [MISSING_MENDOZA_DEPARTMENTS],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Only departments nothing references yet (places, plan requests) are
    // removed. Rows that already existed before `up` cannot be told apart and
    // go too when unused, which is harmless: `up` would recreate them.
    await queryRunner.query(
      `
      DELETE FROM "department"
      USING "city", "country"
      WHERE "department"."id_city" = "city"."id"
        AND "city"."id_country" = "country"."id"
        AND "city"."name" = 'Mendoza' AND "country"."name" = 'Argentina'
        AND "department"."name" = ANY($1::varchar[])
        AND NOT EXISTS (
          SELECT 1 FROM "place" WHERE "place"."id_department" = "department"."id"
        )
        AND NOT EXISTS (
          SELECT 1 FROM "plan_request"
          WHERE "plan_request"."id_department" = "department"."id"
        )
    `,
      [MISSING_MENDOZA_DEPARTMENTS],
    );
  }
}
