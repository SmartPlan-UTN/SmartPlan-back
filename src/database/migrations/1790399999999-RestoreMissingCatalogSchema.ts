import { MigrationInterface, QueryRunner } from 'typeorm';
import { AddPriceModel1790000000000 } from './1790000000000-AddPriceModel';
import { AddCatalogPlatform1790100000000 } from './1790100000000-AddCatalogPlatform';
import { AddExternalPriceCache1790200000000 } from './1790200000000-AddExternalPriceCache';

/** Restore catalog columns removed by legacy synchronize without replaying ledger entries. */
export class RestoreMissingCatalogSchema1790399999999 implements MigrationInterface {
  name = 'RestoreMissingCatalogSchema1790399999999';

  async up(q: QueryRunner): Promise<void> {
    const missingPrice = !(await q.hasColumn('activity', 'price_kind'));
    const missingCatalog = !(await q.hasColumn('place', 'slug'));
    const missingExternal =
      !(await q.hasColumn('place', 'google_place_id')) &&
      !(await q.hasColumn('activity_place', 'external_price_min'));
    if (!missingPrice && !missingCatalog && !missingExternal) return;

    // The original migrations remain the source of schema definitions. Existing
    // tables, indexes and constraints are retained; duplicate DDL is isolated
    // with savepoints so a partially restored schema remains recoverable.
    const guarded = new Proxy(q, {
      get(target, property) {
        if (property !== 'query') {
          const value: unknown = Reflect.get(target, property);
          return typeof value === 'function'
            ? (value.bind(target) as unknown)
            : value;
        }
        return async (
          sql: string,
          parameters?: unknown[],
        ): Promise<unknown> => {
          const statement = sql
            .replace(/ADD COLUMN /g, 'ADD COLUMN IF NOT EXISTS ')
            .replace(/CREATE TABLE /g, 'CREATE TABLE IF NOT EXISTS ')
            .replace(
              /CREATE UNIQUE INDEX /g,
              'CREATE UNIQUE INDEX IF NOT EXISTS ',
            )
            .replace(/CREATE INDEX /g, 'CREATE INDEX IF NOT EXISTS ');
          await target.query('SAVEPOINT catalog_schema_restore');
          try {
            const result: unknown = await target.query(statement, parameters);
            await target.query('RELEASE SAVEPOINT catalog_schema_restore');
            return result;
          } catch (error) {
            await target.query('ROLLBACK TO SAVEPOINT catalog_schema_restore');
            await target.query('RELEASE SAVEPOINT catalog_schema_restore');
            const code = (error as { code?: string }).code;
            if (code === '42710' || code === '42P07') return [];
            throw error;
          }
        };
      },
    });

    if (missingPrice) {
      await new AddPriceModel1790000000000().up(guarded);
      if (await q.hasColumn('activity', 'cost_basis')) {
        await q.query(`UPDATE activity SET price_unit = 'PER_PERSON'
          WHERE price_source = 'LEGACY' AND cost_basis = 'per_person'`);
      }
      if (await q.hasColumn('plan_detail', 'per_person_cost')) {
        await q.query(`UPDATE plan_detail SET price_unit = 'PER_PERSON',
          price_min = per_person_cost, price_max = per_person_cost,
          estimated_cost = per_person_cost
          WHERE price_source = 'LEGACY' AND per_person_cost > 0`);
      }
    }
    if (missingCatalog) await new AddCatalogPlatform1790100000000().up(guarded);
    if (missingExternal)
      await new AddExternalPriceCache1790200000000().up(guarded);
  }

  down(): Promise<void> {
    // An automatic rollback must never remove restored business columns.
    return Promise.resolve();
  }
}
