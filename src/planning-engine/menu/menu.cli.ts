import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import type { DataSource } from 'typeorm';
import { PlaceMenuObservation } from '../entities/place-menu-observation.entity';
import { observeSchemaMenu, type MenuSource } from './schema-menu';
import { assessDatabaseTarget } from '../../config/database-target';

/** Reviewed capture -> dry-run preview -> explicit local import. No provider calls. */
async function main(): Promise<void> {
  const [sourceFile, captureFile, ...args] = process.argv.slice(2);
  if (!sourceFile || !captureFile)
    throw new Error(
      'Usage: catalog:menu <source.json> <jsonld.json> [--confirm <local_database>]',
    );
  const source = JSON.parse(readFileSync(sourceFile, 'utf8')) as MenuSource;
  const observation = observeSchemaMenu(
    readFileSync(captureFile, 'utf8'),
    source,
    new Date(),
  );
  const confirmIndex = args.indexOf('--confirm');
  if (confirmIndex < 0) {
    console.log(
      JSON.stringify(
        { dryRun: true, placeId: source.placeId, ...observation },
        null,
        2,
      ),
    );
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- initialize only after the offline preview and source validation
  const { default: dataSource } = require('../../database/data-source') as {
    default: DataSource;
  };
  const options = dataSource.options as {
    url?: string;
    host?: string;
    database?: string;
  };
  const target = assessDatabaseTarget({
    url: options.url,
    host: options.host,
    database: options.database,
    deployed: false,
  });
  if (!target.isLocal || args[confirmIndex + 1] !== target.database)
    throw new Error('Import requires the exact local database name.');
  Object.assign(dataSource.options, {
    synchronize: false,
    migrationsRun: false,
  });
  await dataSource.initialize();
  try {
    const place = await dataSource.query<{ id: number }[]>(
      'SELECT id FROM place WHERE id = $1 AND deleted_at IS NULL',
      [source.placeId],
    );
    if (!place.length) throw new Error('Reviewed place does not exist.');
    await dataSource.getRepository(PlaceMenuObservation).insert({
      ...observation,
      idPlace: source.placeId,
      observedAt: new Date(observation.observedAt),
      expiresAt: new Date(observation.expiresAt),
      sourceUpdatedAt: observation.sourceUpdatedAt
        ? new Date(observation.sourceUpdatedAt)
        : null,
    });
    console.log(
      `Recorded ${observation.items.length} menu facts for place ${source.placeId}.`,
    );
  } finally {
    await dataSource.destroy();
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Menu import failed.');
  process.exitCode = 1;
});
