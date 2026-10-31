import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCommunityExperienceLikes1793200000000 implements MigrationInterface {
  name = 'AddCommunityExperienceLikes1793200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "community_experience_like" (
        "id" SERIAL NOT NULL,
        "id_feedback" integer NOT NULL,
        "id_user" integer NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_community_experience_like" PRIMARY KEY ("id"),
        CONSTRAINT "FK_community_experience_like_feedback" FOREIGN KEY ("id_feedback") REFERENCES "feedback"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_community_experience_like_user" FOREIGN KEY ("id_user") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_community_experience_like_feedback_user" ON "community_experience_like" ("id_feedback", "id_user")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_community_experience_like_feedback" ON "community_experience_like" ("id_feedback")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_community_experience_like_user" ON "community_experience_like" ("id_user")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_community_experience_like_user"`);
    await queryRunner.query(
      `DROP INDEX "IDX_community_experience_like_feedback"`,
    );
    await queryRunner.query(
      `DROP INDEX "UQ_community_experience_like_feedback_user"`,
    );
    await queryRunner.query(`DROP TABLE "community_experience_like"`);
  }
}
