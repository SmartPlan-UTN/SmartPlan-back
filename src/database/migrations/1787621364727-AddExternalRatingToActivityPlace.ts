import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExternalRatingToActivityPlace1787621364727 implements MigrationInterface {
  name = 'AddExternalRatingToActivityPlace1787621364727';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "activity_place" ADD "external_rating" numeric(2,1)`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_place" ADD "external_rating_count" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_place" ADD CONSTRAINT "CHK_d47955359d965af11ff39316dc" CHECK ("external_rating" IS NULL OR "external_rating" BETWEEN 0 AND 5)`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_place" ADD CONSTRAINT "CHK_db963ef8e4be5ac5a067eafc99" CHECK (("external_rating" IS NULL AND "external_rating_count" IS NULL) OR ("external_rating" IS NOT NULL AND "external_rating_count" IS NOT NULL))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "activity_place" DROP CONSTRAINT "CHK_db963ef8e4be5ac5a067eafc99"`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_place" DROP CONSTRAINT "CHK_d47955359d965af11ff39316dc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_place" DROP COLUMN "external_rating_count"`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_place" DROP COLUMN "external_rating"`,
    );
  }
}
