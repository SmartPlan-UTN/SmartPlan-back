import {
  assessDatabaseTarget,
  describeDatabaseTarget,
  isDeployedRuntime,
  RemoteDatabaseRefusedError,
} from './database-target';

const REMOTE_URL =
  'postgresql://user:secret@trolley.proxy.rlwy.net:57059/railway';

describe('assessDatabaseTarget', () => {
  it('always allows a local database', () => {
    const target = assessDatabaseTarget({
      host: 'localhost',
      database: 'smartplan_mendoza',
      deployed: false,
    });
    expect(target).toMatchObject({
      isLocal: true,
      mayChangeSchemaOutsideMigrations: true,
      mayRunMigrations: true,
    });
  });

  it('refuses a remote database from a developer process (the .env accident)', () => {
    expect(() =>
      assessDatabaseTarget({ url: REMOTE_URL, deployed: false }),
    ).toThrow(RemoteDatabaseRefusedError);
  });

  it('refusal message names the target but never the credentials', () => {
    try {
      assessDatabaseTarget({ url: REMOTE_URL, deployed: false });
      throw new Error('should have refused');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('trolley.proxy.rlwy.net');
      expect(message).not.toContain('secret');
      expect(message).not.toContain('user:');
    }
  });

  it('accepts a remote database on the deployment platform', () => {
    const target = assessDatabaseTarget({ url: REMOTE_URL, deployed: true });
    expect(target.mayRunMigrations).toBe(true);
    expect(target.mayChangeSchemaOutsideMigrations).toBe(false);
  });

  it('accepts a remote database only for the exact opted-in host, and then never migrates or synchronises it', () => {
    const target = assessDatabaseTarget({
      url: REMOTE_URL,
      deployed: false,
      allowRemoteHost: 'trolley.proxy.rlwy.net',
    });
    expect(target.mayChangeSchemaOutsideMigrations).toBe(false);
    expect(target.mayRunMigrations).toBe(false);

    expect(() =>
      assessDatabaseTarget({
        url: REMOTE_URL,
        deployed: false,
        allowRemoteHost: 'another.host',
      }),
    ).toThrow(RemoteDatabaseRefusedError);
  });

  it('lets an explicit second opt-in run migrations from outside', () => {
    const target = assessDatabaseTarget({
      url: REMOTE_URL,
      deployed: false,
      allowRemoteHost: 'trolley.proxy.rlwy.net',
      allowRemoteMigrations: true,
    });
    expect(target.mayRunMigrations).toBe(true);
  });

  it('fails closed when the host cannot be determined', () => {
    expect(() => assessDatabaseTarget({ deployed: false })).toThrow(
      RemoteDatabaseRefusedError,
    );
  });
});

describe('isDeployedRuntime', () => {
  it('detects the platform markers', () => {
    expect(isDeployedRuntime({ RAILWAY_ENVIRONMENT_NAME: 'staging' })).toBe(
      true,
    );
    expect(isDeployedRuntime({ NODE_ENV: 'production' })).toBe(false);
    expect(isDeployedRuntime({ RAILWAY_PROJECT_ID: '' })).toBe(false);
  });
});

describe('describeDatabaseTarget', () => {
  it('formats host, port and database', () => {
    expect(
      describeDatabaseTarget({
        host: 'localhost',
        port: '5432',
        database: 'smartplan',
        isLocal: true,
      }),
    ).toBe('localhost:5432/smartplan [local]');
  });
});
