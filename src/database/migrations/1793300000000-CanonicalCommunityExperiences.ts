import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CanonicalCommunityExperiences1793300000000 implements MigrationInterface {
  name = 'CanonicalCommunityExperiences1793300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "feedback"
        ADD COLUMN IF NOT EXISTS "id_community_plan" integer,
        ADD COLUMN IF NOT EXISTS "id_community_author" integer
    `);
    await queryRunner.query(`
      UPDATE "feedback" AS f
      SET "id_community_plan" = outing."id_source_plan",
          "id_community_author" = outing."id_user"
      FROM "plan" AS outing
      WHERE outing."id" = f."id_plan"
        AND f."is_shared" = true
        AND outing."kind" = 'outing'
        AND outing."id_source_plan" IS NOT NULL
    `);
    // Public reviews need a canonical plan identity to enforce one review per
    // person and to count repeat outings. Keep orphaned feedback private.
    await queryRunner.query(`
      WITH demoted AS (
        UPDATE "feedback" f
        SET "is_shared" = false,
            "community_consent_version" = 0,
            "shared_at" = NULL,
            "id_community_author" = NULL,
            "id_community_plan" = NULL
        WHERE f."is_shared" = true
          AND NOT EXISTS (
            SELECT 1 FROM "plan" outing
            WHERE outing."id" = f."id_plan"
              AND outing."kind" = 'outing'
              AND outing."id_source_plan" IS NOT NULL
          )
        RETURNING f."id"
      )
      DELETE FROM "community_experience_like" l
      USING demoted d
      WHERE l."id_feedback" = d."id"
    `);
    // Keep the most recently shared review public. Older reviews remain intact
    // as private CU23 feedback, and their reactions leave public totals.
    await queryRunner.query(`
      WITH ranked AS (
        SELECT f."id", ROW_NUMBER() OVER (
          PARTITION BY f."id_community_author", f."id_community_plan"
          ORDER BY f."shared_at" DESC NULLS LAST, f."id" DESC
        ) AS position
        FROM "feedback" f
        WHERE f."is_shared" = true
          AND f."id_community_author" IS NOT NULL
          AND f."id_community_plan" IS NOT NULL
      ), demoted AS (
        UPDATE "feedback" f
        SET "is_shared" = false,
            "community_consent_version" = 0,
            "shared_at" = NULL,
            "id_community_author" = NULL,
            "id_community_plan" = NULL
        FROM ranked r
        WHERE f."id" = r."id" AND r.position > 1
        RETURNING f."id"
      )
      DELETE FROM "community_experience_like" l
      USING demoted d
      WHERE l."id_feedback" = d."id"
    `);
    await queryRunner.query(`
      ALTER TABLE "feedback"
        ADD CONSTRAINT "FK_feedback_community_plan" FOREIGN KEY ("id_community_plan") REFERENCES "plan"("id") ON DELETE SET NULL,
        ADD CONSTRAINT "FK_feedback_community_author" FOREIGN KEY ("id_community_author") REFERENCES "user"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_feedback_community_plan" ON "feedback" ("id_community_plan")`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_feedback_community_author_plan"
      ON "feedback" ("id_community_author", "id_community_plan")
      WHERE "is_shared" = true
        AND "id_community_author" IS NOT NULL
        AND "id_community_plan" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "community_experience_visit" (
        "id" SERIAL NOT NULL,
        "id_feedback" integer NOT NULL,
        "id_outing" integer NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_community_experience_visit" PRIMARY KEY ("id"),
        CONSTRAINT "FK_community_experience_visit_feedback" FOREIGN KEY ("id_feedback") REFERENCES "feedback"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_community_experience_visit_outing" FOREIGN KEY ("id_outing") REFERENCES "plan"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_community_experience_visit_outing" ON "community_experience_visit" ("id_outing")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_community_experience_visit_feedback_outing" ON "community_experience_visit" ("id_feedback", "id_outing")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_community_experience_visit_feedback" ON "community_experience_visit" ("id_feedback")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "community_experience_visit"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_feedback_community_author_plan"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_feedback_community_plan"`,
    );
    await queryRunner.query(
      `ALTER TABLE "feedback" DROP CONSTRAINT IF EXISTS "FK_feedback_community_author", DROP CONSTRAINT IF EXISTS "FK_feedback_community_plan"`,
    );
    await queryRunner.query(
      `ALTER TABLE "feedback" DROP COLUMN IF EXISTS "id_community_author", DROP COLUMN IF EXISTS "id_community_plan"`,
    );
  }
}
