import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { DataSource, QueryRunner } from 'typeorm';
import { AutenticacionSesiones1787160000000 } from '../src/database/migrations/1787160000000-AutenticacionSesiones';
import { crearAppDePrueba } from './crear-app-de-prueba';

interface ColumnaConsultada {
  column_name: string;
  is_nullable: string;
}

interface EmailConsultado {
  email: string;
}

describe('migración de autenticación (e2e)', () => {
  let app: INestApplication<App>;
  let fuente: DataSource;
  let queryRunner: QueryRunner;
  const esquema = 'auth_migration_test';

  beforeAll(async () => {
    app = await crearAppDePrueba();
    fuente = app.get(DataSource);
    queryRunner = fuente.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.query(`CREATE SCHEMA "${esquema}"`);
    await queryRunner.query(`SET search_path TO "${esquema}"`);
  });

  afterAll(async () => {
    await queryRunner.query('SET search_path TO public');
    await queryRunner.query(`DROP SCHEMA IF EXISTS "${esquema}" CASCADE`);
    await queryRunner.release();
    await app.close();
  });

  it('normaliza emails y agrega/revierte la expiración de sesión', async () => {
    const autenticacion = new AutenticacionSesiones1787160000000();
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
        "activa" boolean NOT NULL DEFAULT true
      )`,
    );
    await queryRunner.query(
      `INSERT INTO "usuario" ("email") VALUES ('  ANA@EXAMPLE.COM  ')`,
    );
    await queryRunner.query(
      `INSERT INTO "sesion_usuario" ("id_usuario", "token_hash", "fecha_inicio")
       VALUES (1, 'hash-token-no-real', NOW())`,
    );

    await autenticacion.up(queryRunner);

    const columnas = (await queryRunner.query(
      `SELECT column_name, is_nullable
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'sesion_usuario'
         AND column_name = 'fecha_expiracion'`,
      [esquema],
    )) as ColumnaConsultada[];
    const emails = (await queryRunner.query(
      `SELECT email FROM "usuario" WHERE id = 1`,
    )) as EmailConsultado[];
    expect(columnas).toEqual([
      { column_name: 'fecha_expiracion', is_nullable: 'NO' },
    ]);
    expect(emails).toEqual([{ email: 'ana@example.com' }]);

    await autenticacion.down(queryRunner);
    const columnasTrasRevertir = (await queryRunner.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'sesion_usuario'
         AND column_name = 'fecha_expiracion'`,
      [esquema],
    )) as ColumnaConsultada[];
    expect(columnasTrasRevertir).toEqual([]);
  });
});
