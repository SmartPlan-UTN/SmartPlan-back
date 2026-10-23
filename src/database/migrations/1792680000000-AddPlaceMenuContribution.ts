import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlaceMenuContribution1792680000000 implements MigrationInterface {
  name = 'AddPlaceMenuContribution1792680000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "place_menu_contribution" (
      "id" SERIAL NOT NULL PRIMARY KEY,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "deleted_at" timestamptz,
      "id_place" integer NOT NULL REFERENCES "place"("id") ON DELETE CASCADE,
      "id_user" integer NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "source_url" varchar(500),
      "menu_text" text,
      "status" varchar(12) NOT NULL DEFAULT 'pending',
      "review_note" varchar(500),
      "reviewed_by" integer,
      "reviewed_at" timestamptz,
      CONSTRAINT "CHK_place_menu_contribution_status" CHECK ("status" IN ('pending','accepted','rejected')),
      CONSTRAINT "CHK_place_menu_contribution_content" CHECK ("source_url" IS NOT NULL OR "menu_text" IS NOT NULL)
    )`);
    await queryRunner.query(
      'CREATE INDEX "IDX_place_menu_contribution_place" ON "place_menu_contribution" ("id_place")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_place_menu_contribution_status" ON "place_menu_contribution" ("status", "created_at")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_place_menu_contribution_user" ON "place_menu_contribution" ("id_user", "created_at")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "place_menu_contribution"');
  }
}
