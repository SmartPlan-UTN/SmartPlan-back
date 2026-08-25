import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCollectionDescription1787616000000 implements MigrationInterface {
  name = 'AddCollectionDescription1787616000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "collection" ADD "description" character varying(500)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "collection" DROP COLUMN "description"`,
    );
  }
}
