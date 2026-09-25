import { DataSource } from 'typeorm';
import cliDataSource from '../data-source';
import { TableSummary } from './seed';
import {
  seedTestData,
  TEST_ADMIN_EMAIL,
  TEST_USER_EMAIL,
  TEST_PASSWORD,
} from './test-seed';

const dataSource = new DataSource({
  ...cliDataSource.options,
  synchronize: false,
  migrationsRun: false,
  logging: false,
});

async function execute(): Promise<void> {
  await dataSource.initialize();

  try {
    const summary = await seedTestData(dataSource);
    printSummary(summary);
  } finally {
    await dataSource.destroy();
  }
}

function printSummary(summary: TableSummary[]): void {
  const width = Math.max(...summary.map((row) => row.table.length));
  const created = summary.reduce((total, row) => total + row.created, 0);

  console.log('\nTest data seed\n');

  for (const row of summary) {
    const quantity = String(row.created).padStart(3);
    console.log(
      `  ${row.table.padEnd(width)}  ${quantity} created` +
        `  ${String(row.existing).padStart(3)} already existed`,
    );
  }

  console.log(
    created === 0
      ? '\nNothing to seed: the test data is already up to date.\n'
      : `\nDone: ${created} new rows.\n`,
  );
  console.log(
    `Admin user -> email: ${TEST_ADMIN_EMAIL}  password: ${TEST_PASSWORD}`,
  );
  console.log(
    `Regular user -> email: ${TEST_USER_EMAIL}  password: ${TEST_PASSWORD}\n`,
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
    `\nThe test data could not be seeded.\n` +
      `Cause: ${describeError(error)}\n\n` +
      `Verify that the database is running (pnpm db:up), the schema exists ` +
      `(pnpm migration:run), and the catalog data was seeded (pnpm db:seed).\n`,
  );

  process.exitCode = 1;
});
