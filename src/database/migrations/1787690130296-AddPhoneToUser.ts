import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPhoneToUser1787690130296 implements MigrationInterface {
  name = 'AddPhoneToUser1787690130296';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD "phone" character varying(30)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "phone"`);
  }
}
