import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGooglePlaceIdToActivityPlace1787619668992 implements MigrationInterface {
  name = 'AddGooglePlaceIdToActivityPlace1787619668992';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "activity_place" ADD "google_place_id" character varying(255)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_813432ef36d5a788844f08ffe5" ON "activity_place" ("google_place_id") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_813432ef36d5a788844f08ffe5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_place" DROP COLUMN "google_place_id"`,
    );
  }
}
