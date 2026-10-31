import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Dated cinema screenings read from cinemas' own published schedules. */
export class AddScreenings1792000000003 implements MigrationInterface {
  name = 'AddScreenings1792000000003';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "screening" (
      "id" SERIAL NOT NULL PRIMARY KEY,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "deleted_at" timestamptz,
      "id_place" integer NOT NULL REFERENCES "place"("id") ON DELETE CASCADE,
      "movie_title" varchar(200) NOT NULL,
      "duration_minutes" smallint NOT NULL,
      "starts_at" timestamptz NOT NULL,
      "format" varchar(60),
      "language" varchar(30),
      "room" varchar(60),
      "price_kind" varchar(12) NOT NULL DEFAULT 'UNKNOWN',
      "price_min" numeric(12,2),
      "price_source_ref" varchar(500),
      "booking_url" varchar(500),
      "source_url" varchar(500) NOT NULL,
      "observed_at" timestamptz NOT NULL,
      "expires_at" timestamptz NOT NULL,
      CONSTRAINT "CHK_screening_duration" CHECK ("duration_minutes" > 0 AND "duration_minutes" < 600)
    )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_screening_source" ON "screening" ("id_place", "movie_title", "starts_at", "room") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_screening_starts" ON "screening" ("starts_at")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "screening"');
  }
}
