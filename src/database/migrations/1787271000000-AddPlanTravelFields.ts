import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPlanTravelFields1787271000000 implements MigrationInterface {
  name = 'AddPlanTravelFields1787271000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('plan', [
      new TableColumn({
        name: 'travel_distance_meters',
        type: 'integer',
        isNullable: true,
      }),
      new TableColumn({
        name: 'travel_duration_seconds',
        type: 'integer',
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('plan', [
      'travel_duration_seconds',
      'travel_distance_meters',
    ]);
  }
}
