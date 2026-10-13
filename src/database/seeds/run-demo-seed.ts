import { DataSource } from 'typeorm';
import cliDataSource from '../data-source';
import { seedDemoContent } from './demo-seed';
import { TableSummary } from './seed';

const dataSource = new DataSource({
  ...cliDataSource.options,
  synchronize: false,
  migrationsRun: false,
  logging: false,
});

async function execute(): Promise<void> {
  await dataSource.initialize();

  try {
    const summary = await seedDemoContent(dataSource);
    printSummary(summary);
  } finally {
    await dataSource.destroy();
  }
}

function printSummary(summary: TableSummary[]): void {
  const width = Math.max(...summary.map((row) => row.table.length));
  const created = summary.reduce((total, row) => total + row.created, 0);

  console.log('\nDemo content seed\n');

  for (const row of summary) {
    const quantity = String(row.created).padStart(3);
    console.log(
      `  ${row.table.padEnd(width)}  ${quantity} created` +
        `  ${String(row.existing).padStart(3)} already existed`,
    );
  }

  console.log(
    created === 0
      ? '\nNothing to seed: the demo content is already up to date.\n'
      : `\nDone: ${created} new rows.\n`,
  );
}

function describeError(error: unknown): string {
  if (error instanceof AggregateError) {
    const causes = error.errors.map(describeError).filter(Boolean);

    if (causes.length > 0) {
      return causes.join('; ');
    }
  }

  if (error instanceof Error) {
    const nested = error.cause ? ` (${describeError(error.cause)})` : '';

    return error.message ? `${error.message}${nested}` : error.constructor.name;
  }

  return String(error);
}

execute().catch((error: unknown) => {
  console.error(
    `\nThe demo content could not be seeded.\n` +
      `Cause: ${describeError(error)}\n\n` +
      `Verify that the database is running (pnpm db:up), that the schema exists ` +
      `(pnpm migration:run), and that pnpm db:seed already ran.\n`,
  );

  process.exitCode = 1;
});
