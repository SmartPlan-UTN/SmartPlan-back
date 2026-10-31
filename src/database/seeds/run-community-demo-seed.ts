import { DataSource } from 'typeorm';
import cliDataSource from '../data-source';
import {
  COMMUNITY_DEMO_PASSWORD,
  seedCommunityDemo,
} from './community-demo-seed';

const dataSource = new DataSource({
  ...cliDataSource.options,
  synchronize: false,
  migrationsRun: false,
  logging: false,
});

function assertExactLocalTarget(): string {
  const options = dataSource.options as {
    url?: string;
    host?: string;
    port?: string | number;
    database?: string;
  };
  let host = options.host ?? '';
  let port = String(options.port ?? 5432);
  let database = options.database ?? '';

  if (options.url) {
    const url = new URL(options.url);
    host = url.hostname;
    port = url.port || '5432';
    database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  }

  // Any local port: the database name is what marks the demo target.
  if (
    !['localhost', '127.0.0.1', '::1', '[::1]'].includes(host.toLowerCase()) ||
    database !== 'smartplan_mendoza'
  ) {
    throw new Error(
      `Community demo seed only runs against a local smartplan_mendoza database; resolved target is ${host}:${port}/${database}.`,
    );
  }

  return `${host}:${port}/${database}`;
}

async function execute(): Promise<void> {
  const target = assertExactLocalTarget();
  console.log(`Community demo seed target: ${target}`);
  await dataSource.initialize();

  try {
    const summary = await seedCommunityDemo(dataSource);
    console.log('\nCommunity demo data is ready.');
    console.log(`  ${summary.profiles} demo profiles`);
    console.log(`  ${summary.plans} published demo plans`);
    console.log(`  ${summary.experiences} shared demo experiences`);
    console.log(`  ${summary.likes} demo like relationships`);
    console.log('\nDemo sign-in: demo.01@smartplan.invalid');
    console.log(`Demo password: ${COMMUNITY_DEMO_PASSWORD}`);
  } finally {
    await dataSource.destroy();
  }
}

execute().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nCommunity demo seed failed: ${message}\n`);
  process.exitCode = 1;
});
