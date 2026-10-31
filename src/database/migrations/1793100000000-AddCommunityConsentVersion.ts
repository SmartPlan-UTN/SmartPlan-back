import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Broader Community sharing requires a new opt-in from existing authors. */
export class AddCommunityConsentVersion1793100000000 implements MigrationInterface {
  name = 'AddCommunityConsentVersion1793100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "feedback" ADD "community_consent_version" smallint NOT NULL DEFAULT 0',
    );
    // Existing forms must display an unchecked sharing option; editing an
    // already checked legacy form must not silently expand its audience.
    await queryRunner.query(
      'UPDATE "feedback" SET "is_shared" = false, "shared_at" = NULL WHERE "is_shared" = true',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Withdrawing consent is not undone automatically by a schema rollback.
    await queryRunner.query(
      'ALTER TABLE "feedback" DROP COLUMN "community_consent_version"',
    );
  }
}
