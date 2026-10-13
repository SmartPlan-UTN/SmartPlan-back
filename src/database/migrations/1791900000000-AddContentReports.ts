import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Report-based moderation (SmartPlan-front#156). Ratings, experience
 * comments and experience photos share one `content_status` enum, and users'
 * reports live in `content_report`.
 *
 * Existing data: approved and unreviewed content becomes `published`,
 * rejected content `removed`. Ratings automatic moderation held as `pending`
 * become `under_review` with a system report, so an administrator decides on
 * them instead of publishing them unreviewed. The moderation reasons move to
 * the resolved reports and their columns are dropped. The old moderation
 * permissions are retired; `content.report` and `content.moderate` come from
 * the seed (`pnpm db:seed:prod`).
 *
 * Reverting cannot restore the dropped reasons nor tell `kept` from
 * `published` content apart from an approval.
 */
export class AddContentReports1791900000000 implements MigrationInterface {
  name = 'AddContentReports1791900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "content_status" AS ENUM('published', 'under_review', 'kept', 'removed')`,
    );
    await queryRunner.query(
      `CREATE TYPE "reportable_content_type" AS ENUM('rating', 'experience_comment', 'experience_photo')`,
    );
    await queryRunner.query(
      `CREATE TYPE "report_reason" AS ENUM('harassment', 'hate_speech', 'sexual_content', 'violence', 'spam', 'other')`,
    );
    await queryRunner.query(
      `CREATE TYPE "report_status" AS ENUM('open', 'resolved')`,
    );
    await queryRunner.query(
      `CREATE TYPE "content_decision" AS ENUM('keep', 'remove')`,
    );

    await queryRunner.query(
      `DROP INDEX "public"."IDX_rating_moderation_created"`,
    );
    await queryRunner.query(`
      ALTER TABLE "rating"
        ALTER COLUMN "moderation_status" TYPE "content_status" USING (
          CASE "moderation_status"::text
            WHEN 'approved' THEN 'published'
            WHEN 'pending' THEN 'under_review'
            ELSE 'removed'
          END
        )::"content_status",
        DROP COLUMN "moderation_reason"
    `);
    await queryRunner.query(
      `ALTER TABLE "rating" RENAME COLUMN "moderation_status" TO "status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rating" ALTER COLUMN "status" SET DEFAULT 'published'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_rating_status_created" ON "rating" ("status", "created_at")`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."rating_moderation_status_enum"`,
    );

    await queryRunner.query(`
      ALTER TABLE "feedback"
        ALTER COLUMN "comment_status" TYPE "content_status" USING (
          CASE "comment_status"::text
            WHEN 'rejected' THEN 'removed'
            ELSE 'published'
          END
        )::"content_status",
        DROP COLUMN "comment_moderation_reason"
    `);
    await queryRunner.query(
      `ALTER TABLE "plan_image" ALTER COLUMN "community_status" DROP DEFAULT`,
    );
    await queryRunner.query(`
      ALTER TABLE "plan_image"
        ALTER COLUMN "community_status" TYPE "content_status" USING (
          CASE "community_status"::text
            WHEN 'rejected' THEN 'removed'
            ELSE 'published'
          END
        )::"content_status",
        ALTER COLUMN "community_status" SET DEFAULT 'published',
        DROP COLUMN "community_reason"
    `);
    await queryRunner.query(`DROP TYPE "community_content_status"`);

    await queryRunner.query(`
      CREATE TABLE "content_report" (
        "id" SERIAL NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "content_type" "reportable_content_type" NOT NULL,
        "content_id" integer NOT NULL,
        "id_reporter" integer,
        "reason" "report_reason" NOT NULL,
        "detail" character varying(500),
        "status" "report_status" NOT NULL DEFAULT 'open',
        "id_resolver" integer,
        "resolved_at" TIMESTAMP WITH TIME ZONE,
        "resolution" "content_decision",
        "resolution_reason" character varying(500),
        CONSTRAINT "PK_content_report" PRIMARY KEY ("id"),
        CONSTRAINT "FK_content_report_reporter" FOREIGN KEY ("id_reporter")
          REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_content_report_resolver" FOREIGN KEY ("id_resolver")
          REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_content_report_reporter_content_unique" ON "content_report" ("id_reporter", "content_type", "content_id") WHERE "id_reporter" IS NOT NULL AND "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_content_report_id_resolver" ON "content_report" ("id_resolver")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_content_report_content_status" ON "content_report" ("content_type", "content_id", "status")`,
    );
    await queryRunner.query(`
      INSERT INTO "content_report" ("content_type", "content_id", "reason", "detail")
      SELECT 'rating', "id", 'other', 'Marcada por la moderación automática anterior'
      FROM "rating"
      WHERE "status" = 'under_review' AND "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      UPDATE "permission"
      SET "deleted_at" = now()
      WHERE "key" IN ('rating.moderate', 'experience.moderate')
        AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "permission"
      SET "deleted_at" = NULL
      WHERE "key" IN ('rating.moderate', 'experience.moderate')
    `);
    await queryRunner.query(`DROP TABLE "content_report"`);

    await queryRunner.query(
      `CREATE TYPE "community_content_status" AS ENUM('unreviewed', 'approved', 'rejected')`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_image" ALTER COLUMN "community_status" DROP DEFAULT`,
    );
    await queryRunner.query(`
      ALTER TABLE "plan_image"
        ALTER COLUMN "community_status" TYPE "community_content_status" USING (
          CASE "community_status"::text
            WHEN 'removed' THEN 'rejected'
            WHEN 'kept' THEN 'approved'
            ELSE 'unreviewed'
          END
        )::"community_content_status",
        ALTER COLUMN "community_status" SET DEFAULT 'unreviewed',
        ADD "community_reason" character varying(500)
    `);
    await queryRunner.query(`
      ALTER TABLE "feedback"
        ALTER COLUMN "comment_status" TYPE "community_content_status" USING (
          CASE "comment_status"::text
            WHEN 'removed' THEN 'rejected'
            WHEN 'kept' THEN 'approved'
            ELSE 'unreviewed'
          END
        )::"community_content_status",
        ADD "comment_moderation_reason" character varying(500)
    `);

    await queryRunner.query(
      `CREATE TYPE "public"."rating_moderation_status_enum" AS ENUM('pending', 'approved', 'rejected')`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_rating_status_created"`);
    await queryRunner.query(
      `ALTER TABLE "rating" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(`
      ALTER TABLE "rating"
        ALTER COLUMN "status" TYPE "public"."rating_moderation_status_enum" USING (
          CASE "status"::text
            WHEN 'under_review' THEN 'pending'
            WHEN 'removed' THEN 'rejected'
            ELSE 'approved'
          END
        )::"public"."rating_moderation_status_enum",
        ADD "moderation_reason" character varying(500)
    `);
    await queryRunner.query(
      `ALTER TABLE "rating" RENAME COLUMN "status" TO "moderation_status"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_rating_moderation_created" ON "rating" ("moderation_status", "created_at")`,
    );

    await queryRunner.query(`DROP TYPE "content_decision"`);
    await queryRunner.query(`DROP TYPE "report_status"`);
    await queryRunner.query(`DROP TYPE "report_reason"`);
    await queryRunner.query(`DROP TYPE "reportable_content_type"`);
    await queryRunner.query(`DROP TYPE "content_status"`);
  }
}
