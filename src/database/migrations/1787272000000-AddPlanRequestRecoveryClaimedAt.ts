import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPlanRequestRecoveryClaimedAt1787272000000 implements MigrationInterface {
  name = 'AddPlanRequestRecoveryClaimedAt1787272000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'plan_request',
      new TableColumn({
        name: 'recovery_claimed_at',
        type: 'timestamptz',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('plan_request', 'recovery_claimed_at');
  }
}
