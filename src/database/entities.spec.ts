import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getMetadataArgsStorage } from 'typeorm';

/**
 * Chequeos envelope las entities del model de data.
 *
 * No necesitan base de data: leen la metadata que dejaron los decoradores de
 * TypeORM. Cubren las convenciones que ESLint no puede ver y que, si se rompen,
 * se descubren tarde y caro — cuando una migración ya creó la table con el
 * name equivocado.
 */

/** Carpeta `src/`, dos niveles arriba de este archivo. */
const CARPETA_FUENTE = join(__dirname, '..');

/**
 * Las 37 tablas del model.
 *
 * Son las del diagrama de classes (Anexo Nº5) menos `reporte` y `tipo_reporte`,
 * que el equipo dejó fuera del alcance.
 *
 * La list está escrita a mano a propósito: es la copia de la documentación
 * contra la que se compara el código. Si alguien renombra una table o agrega
 * una entity sin actualizar la documentación, el test falla.
 */
const TABLAS_DEL_MODELO = [
  // Users y acceso
  'user',
  'role',
  'permission',
  'role_permission',
  'user_status',
  'user_preference',
  'user_session',
  'password_recovery',
  // Catálogo
  'activity',
  'category',
  'activity_category',
  'category_status',
  'activity_place',
  // Ubicación
  'place',
  'department',
  'city',
  'country',
  // Planes
  'plan',
  'plan_detail',
  'plan_status',
  'plan_request',
  'plan_request_category',
  'request_status',
  'outing_type',
  // Retroalimentación
  'feedback',
  'feedback_status',
  'rating',
  // Collections y favorites
  'collection',
  'favorite_collection',
  'favorite_list',
  'favorite_activity',
  'favorite_plan',
  // Integración externa
  'external_provider',
  'external_sync',
  // Sistema
  'notification',
  'system_parameter',
  'audit_log',
].sort();

/** `snake_case`: minúsculas, números y guiones bajos que separan palabras. */
const SNAKE_CASE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

/**
 * Importa todos los `*.entity.ts` de `src/`.
 *
 * Es el mismo criterio con el que `database.config.ts` descubre las entities
 * en tiempo de ejecución, así que el test ve exactamente lo que verá la
 * aplicación: una entity nueva entra sola, sin tocar este archivo.
 */
function cargarEntidades(carpeta: string): void {
  for (const input of readdirSync(carpeta, { withFileTypes: true })) {
    const route = join(carpeta, input.name);

    if (input.isDirectory()) {
      cargarEntidades(route);
    } else if (input.name.endsWith('.entity.ts')) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- la carga tiene que ser dinámica: el objetivo del test es descubrir las entities, no listarlas
      require(route);
    }
  }
}

beforeAll(() => {
  cargarEntidades(CARPETA_FUENTE);
});

const metadataStore = getMetadataArgsStorage();

/** Clases de las que hereda `objetivo`, incluida ella misma. */
function conAncestros(objetivo: unknown): unknown[] {
  const cadena: unknown[] = [];
  let actual: unknown = objetivo;

  while (typeof actual === 'function') {
    cadena.push(actual);
    actual = Object.getPrototypeOf(actual);
  }

  return cadena;
}

/** Columnas declaradas en la entity y en las classes abstractas que extiende. */
function getColumns(entity: unknown) {
  const cadena = conAncestros(entity);
  return metadataStore.columns.filter((column) =>
    cadena.includes(column.target),
  );
}

/** Índices declarados en la entity y en las classes abstractas que extiende. */
function getIndexes(entity: unknown) {
  const cadena = conAncestros(entity);
  return metadataStore.indices.filter((indice) =>
    cadena.includes(indice.target),
  );
}

/** Nombre real de la column en PostgreSQL. */
function getColumnName(entity: unknown, property: string): string {
  const column = getColumns(entity).find(
    (candidata) => candidata.propertyName === property,
  );

  return column?.options.name ?? property;
}

describe('entities del model de data', () => {
  it('declara las 37 tablas del model', () => {
    const tablas = metadataStore.tables
      .map((table) => table.name)
      .filter((name): name is string => name !== undefined)
      .sort();

    expect(tablas).toEqual(TABLAS_DEL_MODELO);
  });

  it('nombra las tablas en snake_case y sin repetir', () => {
    const tablas = metadataStore.tables.map((table) => table.name);

    for (const table of tablas) {
      expect(table).toMatch(SNAKE_CASE);
    }

    expect(new Set(tablas).size).toBe(tablas.length);
  });

  it('nombra todas las columns en snake_case', () => {
    for (const table of metadataStore.tables) {
      for (const column of getColumns(table.target)) {
        const name = column.options.name ?? column.propertyName;

        // El objeto lleva el name de la table para que, cuando falle, el
        // message diga qué column de qué table está mal escrita.
        expect({
          table: table.name,
          column: name,
          enSnakeCase: SNAKE_CASE.test(name),
        }).toEqual({ table: table.name, column: name, enSnakeCase: true });
      }
    }
  });

  it('le da a cada entity key primaria y baja lógica', () => {
    for (const table of metadataStore.tables) {
      const columns = getColumns(table.target);

      expect({
        table: table.name,
        primaryKey: columns.some((column) => column.options.primary),
        bajaLogica: columns.some((column) => column.mode === 'deleteDate'),
      }).toEqual({
        table: table.name,
        primaryKey: true,
        bajaLogica: true,
      });
    }
  });

  it('indexa todas las claves foráneas', () => {
    // PostgreSQL no indexa las claves foráneas solo: sin índice, cada query
    // que navega la relación termina en un recorrido completo de la table.
    for (const table of metadataStore.tables) {
      const cadena = conAncestros(table.target);

      const columnasIndexadas = getIndexes(table.target)
        .map((indice) => indice.columns)
        .filter((columns): columns is string[] => Array.isArray(columns))
        // Alcanza con que la key foránea sea la primera column del índice:
        // PostgreSQL puede usar un índice compuesto filtrando solo por ella.
        .map((columns) => getColumnName(table.target, columns[0]));

      const foreignKeys = metadataStore.joinColumns
        .filter((union) => cadena.includes(union.target))
        .map((union) => union.name)
        .filter((name): name is string => name !== undefined);

      for (const key of foreignKeys) {
        expect({
          table: table.name,
          key,
          indexada: columnasIndexadas.includes(key),
        }).toEqual({ table: table.name, key, indexada: true });
      }
    }
  });

  it('permite reutilizar claves únicas después de una baja lógica', () => {
    const indicesQueNuncaSeReutilizan = new Set([
      'password_recovery',
      'user_session',
    ]);

    for (const table of metadataStore.tables) {
      if (indicesQueNuncaSeReutilizan.has(table.name ?? '')) continue;

      for (const indice of getIndexes(table.target)) {
        if (!indice.unique) continue;

        expect({
          table: table.name,
          columns: indice.columns,
          condicion: indice.where,
        }).toEqual({
          table: table.name,
          columns: indice.columns,
          condicion: '"deleted_at" IS NULL',
        });
      }
    }
  });

  it('modela dueño, zona, tiempo available y valoración de activity', () => {
    const columnasPorTabla = new Map(
      metadataStore.tables.map((table) => [
        table.name,
        getColumns(table.target).map(
          (column) => column.options.name ?? column.propertyName,
        ),
      ]),
    );

    expect(columnasPorTabla.get('plan')).toEqual(
      expect.arrayContaining(['id_user', 'id_plan_request']),
    );
    expect(columnasPorTabla.get('plan_request')).toEqual(
      expect.arrayContaining(['id_department', 'available_duration']),
    );
    expect(columnasPorTabla.get('rating')).toEqual(
      expect.arrayContaining(['id_activity']),
    );
    expect(columnasPorTabla.get('rating')).not.toContain('id_plan');
  });

  it('declara restricciones para los valores críticos del dominio', () => {
    const constraintCount = new Map(
      metadataStore.tables.map((table) => {
        const cadena = conAncestros(table.target);
        return [
          table.name,
          metadataStore.checks.filter((check) => cadena.includes(check.target))
            .length,
        ];
      }),
    );

    expect(constraintCount.get('activity')).toBeGreaterThanOrEqual(2);
    expect(constraintCount.get('activity_place')).toBeGreaterThanOrEqual(3);
    expect(constraintCount.get('plan_detail')).toBeGreaterThanOrEqual(3);
    expect(constraintCount.get('plan')).toBeGreaterThanOrEqual(2);
    expect(constraintCount.get('plan_request')).toBeGreaterThanOrEqual(2);
    expect(constraintCount.get('rating')).toBeGreaterThanOrEqual(1);
  });
});
