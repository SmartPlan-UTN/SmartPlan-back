import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlaceMenuObservation1792000000001 implements MigrationInterface {
  name = 'AddPlaceMenuObservation1792000000001';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "place_menu_observation" (
      "id" SERIAL NOT NULL PRIMARY KEY,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "deleted_at" timestamptz,
      "id_place" integer NOT NULL REFERENCES "place"("id") ON DELETE RESTRICT,
      "source_url" varchar(500) NOT NULL,
      "observed_at" timestamptz NOT NULL,
      "source_updated_at" timestamptz,
      "expires_at" timestamptz NOT NULL,
      "content_hash" varchar(64) NOT NULL,
      "items" jsonb NOT NULL,
      CONSTRAINT "CHK_place_menu_observation_dates" CHECK ("expires_at" > "observed_at" AND ("source_updated_at" IS NULL OR "source_updated_at" <= "observed_at")),
      CONSTRAINT "CHK_place_menu_observation_items" CHECK (jsonb_typeof("items") = 'array' AND jsonb_array_length("items") > 0)
    )`);
    await queryRunner.query(
      'CREATE INDEX "IDX_place_menu_observation_place" ON "place_menu_observation" ("id_place", "observed_at")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_place_menu_observation_source" ON "place_menu_observation" ("id_place", "content_hash", "observed_at") WHERE "deleted_at" IS NULL',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "place_menu_observation"');
  }
}
