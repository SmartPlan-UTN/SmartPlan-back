import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `AddContentReports` retired `rating.moderate` and `experience.moderate`
 * but left their role assignments active. An active assignment pointing at
 * a retired permission made every administrator login fail (the session
 * listed the permission keys and found none). Retiring a permission from the
 * panel already retires its assignments; this does the same for those left
 * behind, on any database where the migration already ran.
 *
 * Reverting cannot tell these rows apart from assignments retired on
 * purpose, so `down` leaves them retired.
 */
export class RetireOrphanRolePermissions1792000000000 implements MigrationInterface {
  name = 'RetireOrphanRolePermissions1792000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "role_permission"
      SET "deleted_at" = now()
      WHERE "deleted_at" IS NULL
        AND "id_permission" IN (
          SELECT "id" FROM "permission" WHERE "deleted_at" IS NOT NULL
        )
    `);
  }

  async down(): Promise<void> {
    // Intentionally empty: see the class comment.
  }
}
