import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlanIntentions1788000000000 implements MigrationInterface {
  name = 'AddPlanIntentions1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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

    // CU22 previously overloaded plan.status=selected. It is no longer an
    // intention source, so legacy rows return to the generated lifecycle.
    await queryRunner.query(`
      UPDATE "plan" AS plan
      SET "id_plan_status" = generated.id
      FROM "plan_status" AS selected, "plan_status" AS generated
      WHERE plan."id_plan_status" = selected.id
        AND selected.key = 'selected'
        AND generated.key = 'generated'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_plan_intention_user_plan_unique"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_plan_intention_plan"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_plan_intention_user"`);
    await queryRunner.query(`DROP TABLE "plan_intention"`);
  }
}
