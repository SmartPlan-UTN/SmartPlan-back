import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { DataSource, QueryRunner } from 'typeorm';
import { AuthenticationSessions1787160000000 } from '../src/database/migrations/1787160000000-AuthenticationSessions';
import { createTestApp } from './create-test-app';

interface QueriedColumn {
  column_name: string;
  is_nullable: string;
}

interface QueriedEmail {
  email: string;
}

describe('migración de autenticación (e2e)', () => {
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

  it('normaliza emails y agrega/revierte la expiración de sesión', async () => {
    const authentication = new AuthenticationSessions1787160000000();
    await queryRunner.query(
      `CREATE TABLE "user" (
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
      `INSERT INTO "user" ("email") VALUES ('  ANA@EXAMPLE.COM  ')`,
    );
    await queryRunner.query(
      `INSERT INTO "sesion_usuario" ("id_usuario", "token_hash", "fecha_inicio")
       VALUES (1, 'hash-token-no-real', NOW())`,
    );

    await authentication.up(queryRunner);

    const columnas = (await queryRunner.query(
      `SELECT column_name, is_nullable
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'sesion_usuario'
         AND column_name = 'fecha_expiracion'`,
      [schema],
    )) as QueriedColumn[];
    const emails = (await queryRunner.query(
      `SELECT email FROM "user" WHERE id = 1`,
    )) as QueriedEmail[];
    expect(columnas).toEqual([
      { column_name: 'fecha_expiracion', is_nullable: 'NO' },
    ]);
    expect(emails).toEqual([{ email: 'ana@example.com' }]);

    await authentication.down(queryRunner);
    const columnasTrasRevertir = (await queryRunner.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'sesion_usuario'
         AND column_name = 'fecha_expiracion'`,
      [schema],
    )) as QueriedColumn[];
    expect(columnasTrasRevertir).toEqual([]);
  });
});
