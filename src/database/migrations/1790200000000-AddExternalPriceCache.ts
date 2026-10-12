import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Temporary Google place-level price cache on `activity_place`. Same expiry as
 * the rating cache (`external_expires_at`); never exported and never promoted
 * to the activity's own price.
 */
export class AddExternalPriceCache1790200000000 implements MigrationInterface {
  name = 'AddExternalPriceCache1790200000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "activity_place"
      ADD COLUMN "external_price_min" numeric(12,2),
      ADD COLUMN "external_price_max" numeric(12,2),
      ADD COLUMN "external_price_currency" character varying(3),
      ADD COLUMN "external_price_level" character varying(40)`);
    await q.query(
      `ALTER TABLE "activity_place" ADD CONSTRAINT "CHK_activity_place_external_price_order" CHECK ("external_price_min" IS NULL OR "external_price_max" IS NULL OR "external_price_min" <= "external_price_max")`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "activity_place" DROP CONSTRAINT "CHK_activity_place_external_price_order"`,
    );
    await q.query(`ALTER TABLE "activity_place"
      DROP COLUMN "external_price_level",
      DROP COLUMN "external_price_currency",
      DROP COLUMN "external_price_max",
      DROP COLUMN "external_price_min"`);
  }
}
