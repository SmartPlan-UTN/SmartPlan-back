import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPlanFeedbackFieldsAndNotificationResource1787270000000 implements MigrationInterface {
  name = 'AddPlanFeedbackFieldsAndNotificationResource1787270000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('plan', [
      new TableColumn({
        name: 'completed_at',
        type: 'timestamptz',
        isNullable: true,
      }),
      new TableColumn({
        name: 'feedback_requested_at',
        type: 'timestamptz',
        isNullable: true,
      }),
    ]);

    await queryRunner.addColumns('notification', [
      new TableColumn({
        name: 'resource_type',
        type: 'varchar',
        length: '40',
        isNullable: true,
      }),
      new TableColumn({
        name: 'resource_id',
        type: 'integer',
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('notification', [
      'resource_id',
      'resource_type',
    ]);
    await queryRunner.dropColumns('plan', [
      'feedback_requested_at',
      'completed_at',
    ]);
  }
}
