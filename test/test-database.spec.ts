import {
  applyTestDatabase,
  getConnectionData,
  requireTestSuffix,
  getTestDatabaseName,
} from './test-database';

describe('getTestDatabaseName', () => {
  it('deriva the name of DB_NAME agregando the suffix', () => {
    expect(getTestDatabaseName({ DB_NAME: 'smartplan' })).toBe(
      'smartplan_test',
    );
  });

  it('prioriza DB_NAME_TEST when is definida', () => {
    expect(
      getTestDatabaseName({
        DB_NAME: 'smartplan',
        DB_NAME_TEST: 'otra_base_test',
      }),
    ).toBe('otra_base_test');
  });

  it('does not duplicate the suffix if DB_NAME already it has', () => {
    expect(getTestDatabaseName({ DB_NAME: 'smartplan_test' })).toBe(
      'smartplan_test',
    );
  });

  it('uses smartplan_test when no database name is configured', () => {
    expect(getTestDatabaseName({})).toBe('smartplan_test');
  });
});

describe('requireTestSuffix', () => {
  it('accepts a name that completes in _test', () => {
    expect(requireTestSuffix('smartplan_test')).toBe('smartplan_test');
  });

  it('rejects a name without the suffix', () => {
    expect(() => requireTestSuffix('smartplan')).toThrow('smartplan');
  });

  it('rejects characters that cannot appear in an SQL identifier', () => {
    expect(() =>
      requireTestSuffix('x"; DROP DATABASE smartplan; --_test'),
    ).toThrow('invalid characters');
  });
});

describe('applyTestDatabase', () => {
  it('changes DB_NAME by the base of test', () => {
    const environment = { DB_NAME: 'smartplan', DB_HOST: 'localhost' };

    const name = applyTestDatabase(environment);

    expect(name).toBe('smartplan_test');
    expect(environment.DB_NAME).toBe('smartplan_test');
  });

  it('reescribe also the base within of DATABASE_URL', () => {
    const environment = {
      DATABASE_URL: 'postgresql://user:key@localhost:5433/smartplan',
      DB_NAME: 'smartplan',
    };

    applyTestDatabase(environment);

    expect(environment.DATABASE_URL).toBe(
      'postgresql://user:key@localhost:5433/smartplan_test',
    );
    expect(environment.DB_NAME).toBe('smartplan_test');
  });

  it('fails if DB_NAME_TEST points to a non-test database', () => {
    expect(() => applyTestDatabase({ DB_NAME_TEST: 'produccion' })).toThrow(
      '_test',
    );
  });
});

describe('getConnectionData', () => {
  it('sale of the variables individual', () => {
    expect(
      getConnectionData({
        DB_HOST: 'localhost',
        DB_PORT: '5433',
        DB_USER: 'smartplan',
        DB_PASSWORD: 'smartplan',
        DB_NAME: 'smartplan_test',
      }),
    ).toEqual({
      host: 'localhost',
      port: 5433,
      user: 'smartplan',
      password: 'smartplan',
      database: 'smartplan_test',
    });
  });

  it('parsea DATABASE_URL when is definida', () => {
    expect(
      getConnectionData({
        DATABASE_URL: 'postgresql://u:c@db.railway.app:6543/smartplan_test',
        DB_HOST: 'localhost',
      }),
    ).toMatchObject({
      host: 'db.railway.app',
      port: 6543,
      user: 'u',
      password: 'c',
      database: 'smartplan_test',
    });
  });

  it('desescapa the user and the password of the URL', () => {
    expect(
      getConnectionData({
        DATABASE_URL:
          'postgresql://user%40smart:cla%23ve@localhost:5432/smartplan_test',
      }),
    ).toMatchObject({
      user: 'user@smart',
      password: 'cla#ve',
    });
  });
});
