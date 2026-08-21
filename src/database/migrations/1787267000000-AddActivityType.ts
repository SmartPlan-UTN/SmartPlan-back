import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddActivityType1787267000000 implements MigrationInterface {
  name = 'AddActivityType1787267000000';

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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "public"."IDX_activity_type"');
    await queryRunner.dropColumn('activity', 'type');
  }
}
