import prepareDatabase from './prepare-database';
import { getConnectionData, requireTestSuffix } from './test-database';

// Suites own their fixtures. A failed teardown must not poison the next suite.
beforeAll(async () => {
  const connection = getConnectionData();
  requireTestSuffix(connection.database);
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(connection.host))
    throw new Error('E2E schema resets require a local test database.');
  await prepareDatabase();
}, 30_000);
