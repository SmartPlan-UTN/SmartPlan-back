import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getMetadataArgsStorage } from 'typeorm';

const SOURCE_DIRECTORY = join(__dirname, '..');

const MODEL_TABLES = [
  'user',
  'role',
  'permission',
  'role_permission',
  'user_status',
  'user_preference',
  'user_session',
  'password_recovery',
  'activity',
  'category',
  'activity_category',
  'category_status',
  'activity_place',
  'place',
  'department',
  'city',
  'country',
  'plan',
  'plan_detail',
  'plan_status',
  'plan_request',
  'plan_request_category',
  'request_status',
  'outing_type',
  'feedback',
  'feedback_status',
  'rating',
  'collection',
  'favorite_collection',
  'favorite_list',
  'favorite_activity',
  'favorite_plan',
  'external_provider',
  'external_sync',
  'external_data_usage',
  'notification',
  'system_parameter',
  'audit_log',
].sort();

const SNAKE_CASE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

function loadEntities(directory: string): void {
  for (const input of readdirSync(directory, { withFileTypes: true })) {
    const route = join(directory, input.name);

    if (input.isDirectory()) {
      loadEntities(route);
    } else if (input.name.endsWith('.entity.ts')) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- loading must be dynamic because the test discovers entities instead of listing them
      require(route);
    }
  }
}

beforeAll(() => {
  loadEntities(SOURCE_DIRECTORY);
});

const metadataStore = getMetadataArgsStorage();

function withAncestors(target: unknown): unknown[] {
  const chain: unknown[] = [];
  let current: unknown = target;

  while (typeof current === 'function') {
    chain.push(current);
    current = Object.getPrototypeOf(current);
  }

  return chain;
}

function getColumns(entity: unknown) {
  const chain = withAncestors(entity);
  return metadataStore.columns.filter((column) =>
    chain.includes(column.target),
  );
}

function getIndexes(entity: unknown) {
  const chain = withAncestors(entity);
  return metadataStore.indices.filter((index) => chain.includes(index.target));
}

function getColumnName(entity: unknown, property: string): string {
  const column = getColumns(entity).find(
    (candidate) => candidate.propertyName === property,
  );

  return column?.options.name ?? property;
}

describe('entities of the model of data', () => {
  it('declares the complete set of model tables', () => {
    const tables = metadataStore.tables
      .map((table) => table.name)
      .filter((name): name is string => name !== undefined)
      .sort();

    expect(tables).toEqual(MODEL_TABLES);
  });

  it('names tables in snake_case without duplicates', () => {
    const tables = metadataStore.tables.map((table) => table.name);

    for (const table of tables) {
      expect(table).toMatch(SNAKE_CASE);
    }

    expect(new Set(tables).size).toBe(tables.length);
  });

  it('names all the columns in snake_case', () => {
    for (const table of metadataStore.tables) {
      for (const column of getColumns(table.target)) {
        const name = column.options.name ?? column.propertyName;

        expect({
          table: table.name,
          column: name,
          isSnakeCase: SNAKE_CASE.test(name),
        }).toEqual({ table: table.name, column: name, isSnakeCase: true });
      }
    }
  });

  it('gives each entity a primary key and soft deletion', () => {
    for (const table of metadataStore.tables) {
      const columns = getColumns(table.target);

      expect({
        table: table.name,
        primaryKey: columns.some((column) => column.options.primary),
        softDeletion: columns.some((column) => column.mode === 'deleteDate'),
      }).toEqual({
        table: table.name,
        primaryKey: true,
        softDeletion: true,
      });
    }
  });

  it('indexes all foreign keys', () => {
    for (const table of metadataStore.tables) {
      const chain = withAncestors(table.target);

      const indexedColumns = getIndexes(table.target)
        .map((index) => index.columns)
        .filter((columns): columns is string[] => Array.isArray(columns))
        .map((columns) => getColumnName(table.target, columns[0]));

      const foreignKeys = metadataStore.joinColumns
        .filter((union) => chain.includes(union.target))
        .map((union) => union.name)
        .filter((name): name is string => name !== undefined);

      for (const key of foreignKeys) {
        expect({
          table: table.name,
          key,
          indexed: indexedColumns.includes(key),
        }).toEqual({ table: table.name, key, indexed: true });
      }
    }
  });

  it('allows unique keys to be reused after soft deletion', () => {
    const tablesWithPermanentUniqueIndexes = new Set([
      'password_recovery',
      'user_session',
      'user',
    ]);

    for (const table of metadataStore.tables) {
      if (tablesWithPermanentUniqueIndexes.has(table.name ?? '')) continue;

      for (const index of getIndexes(table.target)) {
        if (!index.unique) continue;

        expect({
          table: table.name,
          columns: index.columns,
          condition: index.where,
        }).toEqual({
          table: table.name,
          columns: index.columns,
          condition: '"deleted_at" IS NULL',
        });
      }
    }
  });

  it('models activity owner, area, available time, and rating', () => {
    const columnsByTable = new Map(
      metadataStore.tables.map((table) => [
        table.name,
        getColumns(table.target).map(
          (column) => column.options.name ?? column.propertyName,
        ),
      ]),
    );

    expect(columnsByTable.get('plan')).toEqual(
      expect.arrayContaining(['id_user', 'id_plan_request']),
    );
    expect(columnsByTable.get('plan_request')).toEqual(
      expect.arrayContaining(['id_department', 'available_duration']),
    );
    expect(columnsByTable.get('rating')).toEqual(
      expect.arrayContaining([
        'id_activity',
        'id_user',
        'id_plan',
        'moderation_status',
      ]),
    );
  });

  it('declares constraints for critical domain values', () => {
    const constraintCount = new Map(
      metadataStore.tables.map((table) => {
        const chain = withAncestors(table.target);
        return [
          table.name,
          metadataStore.checks.filter((check) => chain.includes(check.target))
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
