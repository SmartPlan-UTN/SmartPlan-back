import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { DataSource, QueryRunner } from 'typeorm';
import { AuthenticationSessions1787160000000 } from '../src/database/migrations/1787160000000-AuthenticationSessions';
import { CompleteSchemaEnglishTranslation1787266000000 } from '../src/database/migrations/1787266000000-CompleteSchemaEnglishTranslation';
import { createTestApp } from './create-test-app';

interface QueriedColumn {
  column_name: string;
  is_nullable: string;
}

interface QueriedEmail {
  email: string;
}

describe('migration of authentication (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  const schema = 'auth_migration_test';

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.query(`CREATE SCHEMA "${schema}"`);
    await queryRunner.query(`SET search_path TO "${schema}"`);
  });

  afterAll(async () => {
    await queryRunner.query('SET search_path TO public');
    await queryRunner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await queryRunner.release();
    await app.close();
  });

  it('normalizes emails and adds/reverts session expiration', async () => {
    const authentication = new AuthenticationSessions1787160000000();
    await queryRunner.query(
      `CREATE TABLE "usuario" (
        "id" SERIAL PRIMARY KEY,
        "email" character varying(150) NOT NULL
      )`,
    );
    await queryRunner.query(
      `CREATE TABLE "sesion_usuario" (
        "id" SERIAL PRIMARY KEY,
        "id_usuario" integer NOT NULL,
        "token_hash" character varying(255) NOT NULL,
        "fecha_inicio" TIMESTAMP WITH TIME ZONE NOT NULL,
        "active" boolean NOT NULL DEFAULT true
      )`,
    );
    await queryRunner.query(
      `INSERT INTO "usuario" ("email") VALUES ('  ANA@EXAMPLE.COM  ')`,
    );
    await queryRunner.query(
      `INSERT INTO "sesion_usuario" ("id_usuario", "token_hash", "fecha_inicio")
       VALUES (1, 'hash-token-not-real', NOW())`,
    );

    await authentication.up(queryRunner);

    const columns = (await queryRunner.query(
      `SELECT column_name, is_nullable
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'sesion_usuario'
         AND column_name = 'fecha_expiracion'`,
      [schema],
    )) as QueriedColumn[];
    const emails = (await queryRunner.query(
      `SELECT email FROM "usuario" WHERE id = 1`,
    )) as QueriedEmail[];
    expect(columns).toEqual([
      { column_name: 'fecha_expiracion', is_nullable: 'NO' },
    ]);
    expect(emails).toEqual([{ email: 'ana@example.com' }]);

    await authentication.down(queryRunner);
    const revertedColumns = (await queryRunner.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'sesion_usuario'
         AND column_name = 'fecha_expiracion'`,
      [schema],
    )) as QueriedColumn[];
    expect(revertedColumns).toEqual([]);
  });

  it('renames the remaining active schema objects to English', async () => {
    const translation = new CompleteSchemaEnglishTranslation1787266000000();
    await queryRunner.query('DROP TABLE "sesion_usuario"');
    await queryRunner.query(
      `CREATE TABLE "rating" (
        "puntaje" smallint NOT NULL,
        CONSTRAINT "CHK_87baa812ea06d6aa64dca50dfa" CHECK ("puntaje" BETWEEN 1 AND 5)
      )`,
    );
    await queryRunner.query(
      `CREATE TABLE "user_session" (
        "fecha_expiracion" TIMESTAMP WITH TIME ZONE NOT NULL
      )`,
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_sesion_usuario_fecha_expiracion" ON "user_session" ("fecha_expiracion")',
    );

    await translation.up(queryRunner);

    const ratingColumns = (await queryRunner.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'rating'`,
      [schema],
    )) as QueriedColumn[];
    const sessionColumns = (await queryRunner.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'user_session'`,
      [schema],
    )) as QueriedColumn[];
    const indexes = (await queryRunner.query(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = $1 AND tablename = 'user_session'`,
      [schema],
    )) as Array<{ indexname: string }>;

    expect(ratingColumns).toEqual([{ column_name: 'score' }]);
    expect(sessionColumns).toEqual([{ column_name: 'expires_at' }]);
    expect(indexes).toEqual([{ indexname: 'IDX_user_session_expires_at' }]);

    await translation.down(queryRunner);
  });
});
