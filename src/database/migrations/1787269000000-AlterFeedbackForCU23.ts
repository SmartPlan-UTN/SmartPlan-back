import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AlterFeedbackForCU231787269000000 implements MigrationInterface {
  name = 'AlterFeedbackForCU231787269000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The table is empty in every real environment (no CU17-CU23 code has
    // shipped yet), so this migration rewrites the shape directly instead of
    // backfilling data.
    const table = await queryRunner.getTable('feedback');
    const foreignKey = table?.foreignKeys.find((fk) =>
      fk.columnNames.includes('id_plan_request'),
    );
    if (foreignKey) {
      await queryRunner.dropForeignKey('feedback', foreignKey);
    }
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_feedback_id_plan_request"`,
    );
    await queryRunner.dropColumn('feedback', 'id_plan_request');

    await queryRunner.dropColumn('feedback', 'title');
    await queryRunner.renameColumn('feedback', 'description', 'comment');

    await queryRunner.addColumns('feedback', [
      new TableColumn({ name: 'rating', type: 'smallint', isNullable: false }),
      new TableColumn({
        name: 'tags',
        type: 'text',
        isArray: true,
        isNullable: false,
        default: `'{}'`,
      }),
      new TableColumn({
        name: 'id_plan',
        type: 'integer',
        isNullable: false,
      }),
    ]);

    await queryRunner.query(
      `ALTER TABLE "feedback" ADD CONSTRAINT "CHK_feedback_rating" CHECK ("rating" BETWEEN 1 AND 5)`,
    );

    await queryRunner.query(
      `ALTER TABLE "feedback" DROP CONSTRAINT IF EXISTS "CHK_feedback_actual_cost"`,
    );
    await queryRunner.query(
      `ALTER TABLE "feedback" ADD CONSTRAINT "CHK_feedback_actual_cost" CHECK ("actual_cost" IS NULL OR "actual_cost" > 0)`,
    );

    await queryRunner.query(
      `ALTER TABLE "feedback" ADD CONSTRAINT "FK_feedback_id_plan" FOREIGN KEY ("id_plan") REFERENCES "plan"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    // Deliberately not scoped to "deleted_at" IS NULL: a plan keeps at most
    // one feedback for its whole history, even across a soft-delete (CU23).
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_feedback_id_plan" ON "feedback" ("id_plan")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_feedback_id_plan"`);
    await queryRunner.query(
      `ALTER TABLE "feedback" DROP CONSTRAINT "FK_feedback_id_plan"`,
    );

    await queryRunner.query(
      `ALTER TABLE "feedback" DROP CONSTRAINT IF EXISTS "CHK_feedback_actual_cost"`,
    );
    await queryRunner.query(
      `ALTER TABLE "feedback" ADD CONSTRAINT "CHK_feedback_actual_cost" CHECK ("actual_cost" IS NULL OR "actual_cost" >= 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "feedback" DROP CONSTRAINT "CHK_feedback_rating"`,
    );

    await queryRunner.dropColumns('feedback', ['id_plan', 'tags', 'rating']);

    await queryRunner.renameColumn('feedback', 'comment', 'description');
    await queryRunner.addColumn(
      'feedback',
      new TableColumn({
        name: 'title',
        type: 'varchar',
        length: '150',
        isNullable: false,
        default: `''`,
      }),
    );

    await queryRunner.addColumn(
      'feedback',
      new TableColumn({
        name: 'id_plan_request',
        type: 'integer',
        isNullable: false,
      }),
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_feedback_id_plan_request" ON "feedback" ("id_plan_request")`,
    );
    await queryRunner.query(
      `ALTER TABLE "feedback" ADD CONSTRAINT "FK_feedback_id_plan_request" FOREIGN KEY ("id_plan_request") REFERENCES "plan_request"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
