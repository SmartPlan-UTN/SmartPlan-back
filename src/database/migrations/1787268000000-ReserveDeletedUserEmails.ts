import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReserveDeletedUserEmails1787268000000 implements MigrationInterface {
  name = 'ReserveDeletedUserEmails1787268000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_056bb4c824391d82acd9251aef"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_user_email_unique" ON "user" ("email")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_user_email_unique"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_056bb4c824391d82acd9251aef" ON "user" ("email") WHERE "deleted_at" IS NULL`,
    );
  }
}
