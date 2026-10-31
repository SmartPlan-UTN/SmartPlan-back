import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Language learning loop: normalised phrases SmartPlan could not place or
 * read with confidence, counted for product review. No user id, no full query.
 */
export class AddLanguageObservation1792000000005 implements MigrationInterface {
  name = 'AddLanguageObservation1792000000005';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "language_observation" (
      "id" SERIAL NOT NULL PRIMARY KEY,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "deleted_at" timestamptz,
      "kind" varchar(24) NOT NULL,
      "phrase" varchar(60) NOT NULL,
      "occurrences" integer NOT NULL DEFAULT 1,
      "first_seen_at" timestamptz NOT NULL,
      "last_seen_at" timestamptz NOT NULL,
      "reading" jsonb,
      CONSTRAINT "CHK_language_observation_kind" CHECK ("kind" IN ('UNMAPPED_TERM','LOW_CONFIDENCE','UNRESOLVED_NEGATION','REFINEMENT'))
    )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_language_observation_phrase" ON "language_observation" ("kind", "phrase") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_language_observation_frequency" ON "language_observation" ("kind", "occurrences")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "language_observation"`);
  }
}
