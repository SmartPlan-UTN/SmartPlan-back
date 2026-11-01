import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Separates the three things a `plan` row can be (SmartPlan-back#98):
 * `authored` plans, `generated` alternatives, and personal `outing` copies.
 *
 * Existing data is not converted: environments hold no data worth keeping.
 * Generated alternatives are tagged and made private again, and the old
 * reversible intentions (`plan_intention`) are dropped, since an intention now
 * creates an outing.
 */
export class SeparatePlansAndOutings1789600000000 implements MigrationInterface {
  name = 'SeparatePlansAndOutings1789600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."plan_kind_enum" AS ENUM('authored', 'generated', 'outing')`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan" ADD "kind" "public"."plan_kind_enum" NOT NULL DEFAULT 'authored'`,
    );
    await queryRunner.query(`ALTER TABLE "plan" ADD "id_source_plan" integer`);
    await queryRunner.query(
      `ALTER TABLE "plan" ADD CONSTRAINT "FK_0f601849322f8997788f66e495b" FOREIGN KEY ("id_source_plan") REFERENCES "plan"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_plan_kind" ON "plan" ("kind")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_plan_source_plan" ON "plan" ("id_source_plan")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_plan_active_outing_unique" ON "plan" ("id_user", "id_source_plan") WHERE "kind" = 'outing' AND "completed_at" IS NULL AND "deleted_at" IS NULL`,
    );
    await queryRunner.query(`
      UPDATE "plan"
      SET "kind" = 'generated', "visibility" = 'private'
      WHERE "id_plan_request" IS NOT NULL
    `);

    await queryRunner.query(`DROP TABLE "plan_intention"`);

    await queryRunner.query(
      `ALTER TABLE "notification" ADD "read_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notification" DROP COLUMN "read_at"`);

    await queryRunner.query(`
      CREATE TABLE "plan_intention" (
        "id" SERIAL NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "id_user" integer NOT NULL,
        "id_plan" integer NOT NULL,
        CONSTRAINT "PK_plan_intention" PRIMARY KEY ("id"),
        CONSTRAINT "FK_plan_intention_user" FOREIGN KEY ("id_user") REFERENCES "user"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_plan_intention_plan" FOREIGN KEY ("id_plan") REFERENCES "plan"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_plan_intention_user" ON "plan_intention" ("id_user")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_plan_intention_plan" ON "plan_intention" ("id_plan")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_plan_intention_user_plan_unique" ON "plan_intention" ("id_user", "id_plan") WHERE "deleted_at" IS NULL`,
    );

    // Outings stay behind as ordinary private plans of their holders: ratings
    // and feedback reference them, so they cannot simply be deleted.
    await queryRunner.query(
      `DROP INDEX "public"."IDX_plan_active_outing_unique"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_plan_source_plan"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_plan_kind"`);
    await queryRunner.query(
      `ALTER TABLE "plan" DROP CONSTRAINT "FK_0f601849322f8997788f66e495b"`,
    );
    await queryRunner.query(`ALTER TABLE "plan" DROP COLUMN "id_source_plan"`);
    await queryRunner.query(`ALTER TABLE "plan" DROP COLUMN "kind"`);
    await queryRunner.query(`DROP TYPE "public"."plan_kind_enum"`);
  }
}
