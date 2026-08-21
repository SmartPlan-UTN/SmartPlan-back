import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompleteSchemaEnglishTranslation1787266000000 implements MigrationInterface {
  name = 'CompleteSchemaEnglishTranslation1787266000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "rating" DROP CONSTRAINT "CHK_87baa812ea06d6aa64dca50dfa"',
    );
    await queryRunner.query(
      'ALTER TABLE "rating" RENAME COLUMN "puntaje" TO "score"',
    );
    await queryRunner.query(
      'ALTER TABLE "rating" ADD CONSTRAINT "CHK_rating_score" CHECK ("score" BETWEEN 1 AND 5)',
    );
    await queryRunner.query(
      'ALTER TABLE "user_session" RENAME COLUMN "fecha_expiracion" TO "expires_at"',
    );
    await queryRunner.query(
      'ALTER INDEX "IDX_sesion_usuario_fecha_expiracion" RENAME TO "IDX_user_session_expires_at"',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER INDEX "IDX_user_session_expires_at" RENAME TO "IDX_sesion_usuario_fecha_expiracion"',
    );
    await queryRunner.query(
      'ALTER TABLE "user_session" RENAME COLUMN "expires_at" TO "fecha_expiracion"',
    );
    await queryRunner.query(
      'ALTER TABLE "rating" DROP CONSTRAINT "CHK_rating_score"',
    );
    await queryRunner.query(
      'ALTER TABLE "rating" RENAME COLUMN "score" TO "puntaje"',
    );
    await queryRunner.query(
      'ALTER TABLE "rating" ADD CONSTRAINT "CHK_87baa812ea06d6aa64dca50dfa" CHECK ("puntaje" BETWEEN 1 AND 5)',
    );
  }
}
