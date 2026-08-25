import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRatingOwnershipAndModeration1787273000000 implements MigrationInterface {
  name = 'AddRatingOwnershipAndModeration1787273000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing = (await queryRunner.query(
      'SELECT COUNT(*)::integer AS "count" FROM "rating"',
    )) as unknown as Array<{ count: number | string }>;
    if (Number(existing[0]?.count ?? 0) > 0) {
      throw new Error(
        'Cannot migrate existing ratings without an owner and completed plan. Resolve historical rating data before applying this migration.',
      );
    }

    await queryRunner.query(
      `CREATE TYPE "rating_moderation_status_enum" AS ENUM ('pending', 'approved', 'rejected')`,
    );
    await queryRunner.query(
      `ALTER TABLE "rating" ADD "id_user" integer NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "rating" ADD "id_plan" integer NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "rating" ADD "comment" text`);
    await queryRunner.query(
      `ALTER TABLE "rating" ADD "moderation_status" "rating_moderation_status_enum" NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "rating" ADD "moderation_reason" character varying(500)`,
    );
    await queryRunner.query(
      `ALTER TABLE "rating" ADD CONSTRAINT "FK_rating_user" FOREIGN KEY ("id_user") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "rating" ADD CONSTRAINT "FK_rating_plan" FOREIGN KEY ("id_plan") REFERENCES "plan"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_rating_user" ON "rating" ("id_user")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_rating_plan" ON "rating" ("id_plan")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_rating_user_activity_unique" ON "rating" ("id_user", "id_activity") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_rating_moderation_created" ON "rating" ("moderation_status", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_rating_moderation_created"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_rating_user_activity_unique"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_rating_plan"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_rating_user"`);
    await queryRunner.query(
      `ALTER TABLE "rating" DROP CONSTRAINT "FK_rating_plan"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rating" DROP CONSTRAINT "FK_rating_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rating" DROP COLUMN "moderation_reason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rating" DROP COLUMN "moderation_status"`,
    );
    await queryRunner.query(`ALTER TABLE "rating" DROP COLUMN "comment"`);
    await queryRunner.query(`ALTER TABLE "rating" DROP COLUMN "id_plan"`);
    await queryRunner.query(`ALTER TABLE "rating" DROP COLUMN "id_user"`);
    await queryRunner.query(
      `DROP TYPE "public"."rating_moderation_status_enum"`,
    );
  }
}
