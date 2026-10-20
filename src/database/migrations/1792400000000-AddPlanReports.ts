import { MigrationInterface, QueryRunner } from 'typeorm';

/** The report-based moderation permissions and the roles that hold them. */
const MODERATION_PERMISSIONS = [
  {
    key: 'content.report',
    name: 'Report content',
    description:
      'Report a rating, an experience comment or photo, or a published plan that breaks the rules (#156).',
    roles: ['user', 'admin'],
  },
  {
    key: 'content.moderate',
    name: 'Moderate reported content',
    description:
      'Review reported ratings, experience comments and photos, and plans, and keep or remove them (#156).',
    roles: ['admin'],
  },
];

/**
 * Published plans can be reported too (SmartPlan-front#156). Unlike the
 * other content, a report never hides a plan: `plan.community_status` stays
 * `published` until an administrator keeps it or removes it, which also
 * makes it private.
 *
 * It also creates `content.report` and `content.moderate` where they are
 * missing. `AddContentReports` left them to `pnpm db:seed:prod`, which no
 * deploy runs, so staging answered 403 to every report and to the
 * administrator's queue. A permission is given its seed roles only when no
 * role holds it yet, so an administrator's later changes are respected.
 */
export class AddPlanReports1792400000000 implements MigrationInterface {
  name = 'AddPlanReports1792400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "reportable_content_type" ADD VALUE IF NOT EXISTS 'plan'`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan" ADD "community_status" "content_status" NOT NULL DEFAULT 'published'`,
    );

    for (const permission of MODERATION_PERMISSIONS) {
      await queryRunner.query(
        `
        INSERT INTO "permission" ("key", "name", "description")
        SELECT $1, $2, $3
        WHERE NOT EXISTS (
          SELECT 1 FROM "permission" WHERE "key" = $1 AND "deleted_at" IS NULL
        )
      `,
        [permission.key, permission.name, permission.description],
      );
      await queryRunner.query(
        `
        INSERT INTO "role_permission" ("id_role", "id_permission")
        SELECT "role"."id", "permission"."id"
        FROM "role", "permission"
        WHERE "role"."key" = ANY($2::text[])
          AND "role"."deleted_at" IS NULL
          AND "permission"."key" = $1
          AND "permission"."deleted_at" IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM "role_permission"
            WHERE "role_permission"."id_permission" = "permission"."id"
              AND "role_permission"."deleted_at" IS NULL
          )
      `,
        [permission.key, permission.roles],
      );
    }
  }

  /**
   * Leaves the permissions in place: the seed creates them as well, and
   * `AddContentReports` needs them. Reported plans lose their reports.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "content_report" WHERE "content_type" = 'plan'`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan" DROP COLUMN "community_status"`,
    );
    await queryRunner.query(
      `ALTER TYPE "reportable_content_type" RENAME TO "reportable_content_type_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "reportable_content_type" AS ENUM('rating', 'experience_comment', 'experience_photo')`,
    );
    await queryRunner.query(
      `ALTER TABLE "content_report" ALTER COLUMN "content_type" TYPE "reportable_content_type" USING "content_type"::text::"reportable_content_type"`,
    );
    await queryRunner.query(`DROP TYPE "reportable_content_type_old"`);
  }
}
