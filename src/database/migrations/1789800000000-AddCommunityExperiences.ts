import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCommunityExperiences1789800000000 implements MigrationInterface {
  name = 'AddCommunityExperiences1789800000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TYPE "community_content_status" AS ENUM('unreviewed', 'approved', 'rejected')`,
    );
    await q.query(
      `ALTER TABLE "feedback" ADD "is_shared" boolean NOT NULL DEFAULT false, ADD "shared_at" TIMESTAMP WITH TIME ZONE, ADD "comment_status" "community_content_status", ADD "comment_moderation_reason" character varying(500)`,
    );
    await q.query(
      `ALTER TABLE "plan_image" ADD "community_status" "community_content_status" NOT NULL DEFAULT 'unreviewed', ADD "community_reason" character varying(500), ADD "is_source_copy" boolean NOT NULL DEFAULT false`,
    );
    // Outings made before this column copied the photos of the plan they
    // were copied from: their source plan, or an earlier outing when that
    // plan could no longer be chosen. A copy shares the object key of a photo
    // inserted before it, whichever plan that one belongs to.
    await q.query(
      `UPDATE "plan_image" "copy" SET "is_source_copy" = true FROM "plan" "outing" WHERE "copy"."id_plan" = "outing"."id" AND "outing"."kind" = 'outing' AND EXISTS (SELECT 1 FROM "plan_image" "original" WHERE "original"."object_key" = "copy"."object_key" AND "original"."id" < "copy"."id")`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "plan_image" DROP COLUMN "is_source_copy", DROP COLUMN "community_reason", DROP COLUMN "community_status"`,
    );
    await q.query(
      `ALTER TABLE "feedback" DROP COLUMN "comment_moderation_reason", DROP COLUMN "comment_status", DROP COLUMN "shared_at", DROP COLUMN "is_shared"`,
    );
    await q.query(`DROP TYPE "community_content_status"`);
  }
}
