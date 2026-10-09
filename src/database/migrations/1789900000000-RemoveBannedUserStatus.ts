import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Removes the `banned` account status (SmartPlan-front#138): administration
 * only blocks accounts by suspending them (CU57).
 *
 * Banned accounts become suspended, so they stay blocked, and the catalog row
 * is soft-deleted like any other retired catalog value. Reverting restores the
 * status but cannot tell which suspended accounts were banned before.
 */
export class RemoveBannedUserStatus1789900000000 implements MigrationInterface {
  name = 'RemoveBannedUserStatus1789900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "user"
      SET "id_user_status" = (
        SELECT "id" FROM "user_status"
        WHERE "key" = 'suspended' AND "deleted_at" IS NULL
      )
      WHERE "id_user_status" IN (
        SELECT "id" FROM "user_status" WHERE "key" = 'banned'
      )
    `);
    await queryRunner.query(`
      UPDATE "user_status"
      SET "deleted_at" = now()
      WHERE "key" = 'banned' AND "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "permission"
      SET "description" = 'Suspend or reactivate an account (CU57).'
      WHERE "key" = 'user.change-status'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "permission"
      SET "description" = 'Suspend, ban, or reactivate an account (CU57).'
      WHERE "key" = 'user.change-status'
    `);
    await queryRunner.query(`
      UPDATE "user_status"
      SET "deleted_at" = NULL
      WHERE "key" = 'banned'
    `);
  }
}
