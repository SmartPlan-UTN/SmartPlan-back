import { MigrationInterface, QueryRunner } from 'typeorm';

export class AutenticacionSesiones1787160000000 implements MigrationInterface {
  name = 'AutenticacionSesiones1787160000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "usuario" SET "email" = LOWER(TRIM("email"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "sesion_usuario" ADD "fecha_expiracion" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()`,
    );
    await queryRunner.query(
      `ALTER TABLE "sesion_usuario" ALTER COLUMN "fecha_expiracion" DROP DEFAULT`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_sesion_usuario_fecha_expiracion" ON "sesion_usuario" ("fecha_expiracion")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_sesion_usuario_fecha_expiracion"`);
    await queryRunner.query(
      `ALTER TABLE "sesion_usuario" DROP COLUMN "fecha_expiracion"`,
    );
  }
}
