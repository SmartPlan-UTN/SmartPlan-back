import {
  applyTestDatabase,
  getConnectionData,
  requireTestSuffix,
  getTestDatabaseName,
} from './test-database';

/**
 * Este es el único código de la infraestructura de tests que decide algo, y lo
 * que decide es contra qué base se van a correr `DROP SCHEMA` y `synchronize`.
 * Si se equivoca, se lleva puesta la base de desarrolelo de alguien.
 *
 * Las funciones reciben el environment por parámetro justamente para poder probarlas
 * sin ensuciar el `process.env` del proceso de Jest.
 */
describe('getTestDatabaseName', () => {
  it('deriva el name de DB_NAME agregando el sufijo', () => {
    expect(getTestDatabaseName({ DB_NAME: 'smartplan' })).toBe(
      'smartplan_test',
    );
  });

  it('prioriza DB_NAME_TEST cuando está definida', () => {
    expect(
      getTestDatabaseName({
        DB_NAME: 'smartplan',
        DB_NAME_TEST: 'otra_base_test',
      }),
    ).toBe('otra_base_test');
  });

  it('no duplica el sufijo si DB_NAME ya lo tiene', () => {
    expect(getTestDatabaseName({ DB_NAME: 'smartplan_test' })).toBe(
      'smartplan_test',
    );
  });

  it('usa smartplan_test si no hay nada configurado', () => {
    expect(getTestDatabaseName({})).toBe('smartplan_test');
  });
});

describe('requireTestSuffix', () => {
  it('acepta un name que termina en _test', () => {
    expect(requireTestSuffix('smartplan_test')).toBe('smartplan_test');
  });

  it('rechaza un name sin el sufijo', () => {
    expect(() => requireTestSuffix('smartplan')).toThrow('smartplan');
  });

  it('rechaza caracteres que no pueden ir en un identificador de SQL', () => {
    // El name entra sin escapar en un CREATE DATABASE.
    expect(() =>
      requireTestSuffix('x"; DROP DATABASE smartplan; --_test'),
    ).toThrow('caracteres no permitidos');
  });
});

describe('applyTestDatabase', () => {
  it('cambia DB_NAME por la base de prueba', () => {
    const environment = { DB_NAME: 'smartplan', DB_HOST: 'localhost' };

    const name = applyTestDatabase(environment);

    expect(name).toBe('smartplan_test');
    expect(environment.DB_NAME).toBe('smartplan_test');
  });

  it('reescribe también la base dentro de DATABASE_URL', () => {
    // Si solo se cambiaran las DB_*, una DATABASE_URL definida ganaría envelope
    // ellas (ver database.config.ts) y los tests irían a la base de desarrolelo.
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

  it('falla si DB_NAME_TEST apunta a una base que no es de prueba', () => {
    expect(() => applyTestDatabase({ DB_NAME_TEST: 'produccion' })).toThrow(
      '_test',
    );
  });
});

describe('getConnectionData', () => {
  it('sale de las variables sueltas', () => {
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

  it('parsea DATABASE_URL cuando está definida', () => {
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

  it('desescapa el user y la contraseña de la URL', () => {
    // Una contraseña con caracteres especiales viaja percent-encoded en la URL,
    // pero el client `pg` la necesita en light.
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
