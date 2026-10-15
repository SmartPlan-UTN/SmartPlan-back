import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCaseInsensitiveCategoryName1788100000000 implements MigrationInterface {
  name = 'AddCaseInsensitiveCategoryName1788100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d33abebaa7dad62b5695385aa2"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_category_name_unique_case_insensitive" ON "category" (LOWER("name")) WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_category_name_unique_case_insensitive"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_d33abebaa7dad62b5695385aa2" ON "category" ("name") WHERE "deleted_at" IS NULL`,
    );
  }
}
