import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDismissedRecommendation1788100000000 implements MigrationInterface {
  name = 'AddDismissedRecommendation1788100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "dismissed_recommendation" (
        "id" SERIAL NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "id_user" integer NOT NULL,
        "id_plan" integer NOT NULL,
        CONSTRAINT "PK_dismissed_recommendation" PRIMARY KEY ("id"),
        CONSTRAINT "FK_dismissed_recommendation_user" FOREIGN KEY ("id_user") REFERENCES "user"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_dismissed_recommendation_plan" FOREIGN KEY ("id_plan") REFERENCES "plan"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_dismissed_recommendation_user" ON "dismissed_recommendation" ("id_user")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dismissed_recommendation_plan" ON "dismissed_recommendation" ("id_plan")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_dismissed_recommendation_user_plan_unique" ON "dismissed_recommendation" ("id_user", "id_plan") WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_dismissed_recommendation_user_plan_unique"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_dismissed_recommendation_plan"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_dismissed_recommendation_user"`,
    );
    await queryRunner.query(`DROP TABLE "dismissed_recommendation"`);
  }
}
