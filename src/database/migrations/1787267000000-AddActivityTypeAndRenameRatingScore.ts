import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddActivityTypeAndRenameRatingScore1787267000000 implements MigrationInterface {
  name = 'AddActivityTypeAndRenameRatingScore1787267000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'activity',
      new TableColumn({
        name: 'type',
        type: 'varchar',
        length: '80',
        isNullable: true,
      }),
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_activity_type" ON "activity" ("type")',
    );
    await queryRunner.renameColumn('rating', 'puntaje', 'score');
    await queryRunner.query(
      'ALTER TABLE "rating" DROP CONSTRAINT "CHK_87baa812ea06d6aa64dca50dfa"',
    );
    await queryRunner.query(
      'ALTER TABLE "rating" ADD CONSTRAINT "CHK_e40ca4514232a7fd8b402a0cc6" CHECK ("score" BETWEEN 1 AND 5)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "rating" DROP CONSTRAINT "CHK_e40ca4514232a7fd8b402a0cc6"',
    );
    await queryRunner.renameColumn('rating', 'score', 'puntaje');
    await queryRunner.query(
      'ALTER TABLE "rating" ADD CONSTRAINT "CHK_87baa812ea06d6aa64dca50dfa" CHECK ("puntaje" BETWEEN 1 AND 5)',
    );
    await queryRunner.query('DROP INDEX "public"."IDX_activity_type"');
    await queryRunner.dropColumn('activity', 'type');
  }
}
