import { MigrationInterface, QueryRunner } from 'typeorm';

/** Detail of the reports this migration raises in the system's name. */
const PENDING_DETAIL = 'Marcada por la moderación automática anterior';
const REJECTED_DETAIL = 'Rechazada por la moderación anterior';

/**
 * Report-based moderation (SmartPlan-front#156). Ratings, experience
 * comments and experience photos share one `content_status` enum, and users'
 * reports live in `content_report`.
 *
 * Existing data: approved and unreviewed content becomes `published`,
 * rejected content `removed`. Ratings automatic moderation held as `pending`
 * become `under_review` with an open system report that carries the reason
 * they were held, so an administrator decides on them instead of publishing
 * them unreviewed. Each rejection
 * becomes a resolved system report that keeps its reason, and the reason
 * columns are dropped. The old moderation permissions are retired;
 * `content.report` and `content.moderate` come from the seed
 * (`pnpm db:seed:prod`).
 *
 * Reverting restores the reasons from the latest removal of each content,
 * but cannot tell `kept` from `published` content apart from an approval.
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
      `CREATE UNIQUE INDEX "IDX_content_report_reporter_content_unique" ON "content_report" ("id_reporter", "content_type", "content_id") WHERE "id_reporter" IS NOT NULL AND "deleted_at" IS NULL AND "status" = 'open'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_content_report_id_resolver" ON "content_report" ("id_resolver")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_content_report_content_status" ON "content_report" ("content_type", "content_id", "status")`,
    );

    // Read from the old columns before they change type or go away. The
    // reason automatic moderation gave for holding a rating goes into its
    // open report's detail, for the administrator who decides.
    await queryRunner.query(
      `
      INSERT INTO "content_report" ("content_type", "content_id", "reason", "detail")
      SELECT 'rating', "id", 'other',
        LEFT(CONCAT_WS(': ', $1::text, "moderation_reason"), 500)
      FROM "rating"
      WHERE "moderation_status" = 'pending' AND "deleted_at" IS NULL
    `,
      [PENDING_DETAIL],
    );
    await queryRunner.query(
      `
      INSERT INTO "content_report" (
        "content_type", "content_id", "reason", "detail", "status",
        "resolved_at", "resolution", "resolution_reason"
      )
      SELECT "rejected"."type"::"reportable_content_type", "rejected"."id",
        'other', $1, 'resolved', "rejected"."updated_at", 'remove',
        "rejected"."reason"
      FROM (
        SELECT 'rating' AS "type", "id", "updated_at",
          "moderation_reason" AS "reason"
        FROM "rating"
        WHERE "moderation_status" = 'rejected' AND "deleted_at" IS NULL
        UNION ALL
        SELECT 'experience_comment', "id", "updated_at",
          "comment_moderation_reason"
        FROM "feedback"
        WHERE "comment_status" = 'rejected' AND "deleted_at" IS NULL
        UNION ALL
        SELECT 'experience_photo', "id", "updated_at", "community_reason"
        FROM "plan_image"
        WHERE "community_status" = 'rejected'
          AND "is_source_copy" = false
          AND "deleted_at" IS NULL
      ) "rejected"
    `,
      [REJECTED_DETAIL],
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

    // Each rejection gets back the reason of its content's latest removal.
    for (const [type, table, statusColumn, reasonColumn] of [
      ['rating', 'rating', 'moderation_status', 'moderation_reason'],
      [
        'experience_comment',
        'feedback',
        'comment_status',
        'comment_moderation_reason',
      ],
      [
        'experience_photo',
        'plan_image',
        'community_status',
        'community_reason',
      ],
    ]) {
      await queryRunner.query(
        `
        UPDATE "${table}" "content"
        SET "${reasonColumn}" = "removal"."resolution_reason"
        FROM (
          SELECT DISTINCT ON ("content_id") "content_id", "resolution_reason"
          FROM "content_report"
          WHERE "content_type" = $1
            AND "resolution" = 'remove'
            AND "deleted_at" IS NULL
          ORDER BY "content_id", "resolved_at" DESC, "id" DESC
        ) "removal"
        WHERE "removal"."content_id" = "content"."id"
          AND "content"."${statusColumn}" = 'rejected'
      `,
        [type],
      );
    }
    await queryRunner.query(`DROP TABLE "content_report"`);

    await queryRunner.query(`DROP TYPE "content_decision"`);
    await queryRunner.query(`DROP TYPE "report_status"`);
    await queryRunner.query(`DROP TYPE "report_reason"`);
    await queryRunner.query(`DROP TYPE "reportable_content_type"`);
    await queryRunner.query(`DROP TYPE "content_status"`);
  }
}
