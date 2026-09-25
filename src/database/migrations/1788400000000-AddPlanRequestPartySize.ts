import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlanRequestPartySize1788400000000 implements MigrationInterface {
  name = 'AddPlanRequestPartySize1788400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "plan_request"
      ADD "party_size" integer,
      ADD CONSTRAINT "CHK_plan_request_party_size" CHECK ("party_size" IS NULL OR "party_size" >= 1)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "plan_request" DROP CONSTRAINT "CHK_plan_request_party_size"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" DROP COLUMN "party_size"`,
    );
  }
}
