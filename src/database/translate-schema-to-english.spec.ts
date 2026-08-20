import { QueryRunner } from 'typeorm';
import { TranslateSchemaToEnglish1787265077570 } from './migrations/1787265077570-TranslateSchemaToEnglish';

function createQueryRunnerMock(missingColumns: readonly string[] = []): {
  queryRunner: QueryRunner;
  query: jest.Mock;
} {
  const missing = new Set(missingColumns);
  const query = jest
    .fn()
    .mockImplementation((sql: string) =>
      sql.startsWith('SELECT EXISTS')
        ? Promise.resolve([{ hasRows: false }])
        : Promise.resolve(undefined),
    );
  const hasColumn = jest
    .fn()
    .mockImplementation((table: string, column: string) =>
      Promise.resolve(!missing.has(`${table}.${column}`)),
    );
  const queryRunner = { query, hasColumn } as unknown as QueryRunner;

  return { queryRunner, query };
}

describe('TranslateSchemaToEnglish1787265077570', () => {
  const migration = new TranslateSchemaToEnglish1787265077570();

  it('preserves data while translating the complete schema', async () => {
    const { queryRunner, query } = createQueryRunnerMock();

    await migration.up(queryRunner);

    expect(query).toHaveBeenCalledTimes(261);
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "actividad_favorito" RENAME TO "favorite_activity"',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "external_sync" RENAME COLUMN "cantidad_registros" TO "record_count"',
    );
    expect(query).toHaveBeenCalledWith(
      "ALTER TYPE \"registro_auditoria_accion_enum\" RENAME VALUE 'crear' TO 'create'",
    );
    expect(query).toHaveBeenCalledWith(
      'UPDATE "permission" SET "key" = $1 WHERE "key" = $2',
      ['profile.view', 'perfil.consultar'],
    );
    expect(query).toHaveBeenCalledWith(
      'UPDATE "role" SET "key" = $1 WHERE "key" = $2',
      ['user', 'usuario'],
    );
    expect(query).toHaveBeenCalledWith(
      'UPDATE "plan_status" SET "key" = $1 WHERE "key" = $2',
      ['completed', 'finalizado'],
    );
  });

  it('reverses schema and persisted value translations', async () => {
    const { queryRunner, query } = createQueryRunnerMock();

    await migration.down(queryRunner);

    expect(query).toHaveBeenCalledTimes(261);
    expect(query).toHaveBeenCalledWith(
      'UPDATE "permission" SET "key" = $1 WHERE "key" = $2',
      ['perfil.consultar', 'profile.view'],
    );
    expect(query).toHaveBeenCalledWith(
      "ALTER TYPE \"registro_auditoria_accion_enum\" RENAME VALUE 'create' TO 'crear'",
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "external_sync" RENAME COLUMN "record_count" TO "cantidad_registros"',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "favorite_activity" RENAME TO "actividad_favorito"',
    );
  });

  it('reconciles the older empty schema before translating it', async () => {
    const { queryRunner, query } = createQueryRunnerMock([
      'solicitud_plan.id_departamento',
      'solicitud_plan.duracion_disponible',
      'plan.id_usuario',
      'valoracion.id_actividad',
    ]);

    await migration.up(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "solicitud_plan" ADD COLUMN "id_departamento" integer NOT NULL',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "plan" ADD COLUMN "id_usuario" integer NOT NULL',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "valoracion" DROP COLUMN "id_plan" CASCADE',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "valoracion" ADD COLUMN "id_actividad" integer NOT NULL',
    );
  });
});
