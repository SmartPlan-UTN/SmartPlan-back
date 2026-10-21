import { MigrationInterface, QueryRunner } from 'typeorm';

/** Party size the person reported alongside the actual cost of an outing. */
export class AddFeedbackPartySize1790400000000 implements MigrationInterface {
  name = 'AddFeedbackPartySize1790400000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "feedback" ADD COLUMN "actual_party_size" integer`,
    );
    await q.query(
      `ALTER TABLE "feedback" ADD CONSTRAINT "CHK_feedback_actual_party_size" CHECK ("actual_party_size" IS NULL OR "actual_party_size" BETWEEN 1 AND 1000)`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "feedback" DROP CONSTRAINT "CHK_feedback_actual_party_size"`,
    );
    await q.query(`ALTER TABLE "feedback" DROP COLUMN "actual_party_size"`);
  }
}
