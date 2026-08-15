import {
  aplicarBaseDeDatosDePrueba,
  datosDeConexion,
  exigirSufijoDePrueba,
  nombreDeLaBaseDePrueba,
} from './base-de-datos-de-prueba';

/**
 * Este es el único código de la infraestructura de tests que decide algo, y lo
 * que decide es contra qué base se van a correr `DROP SCHEMA` y `synchronize`.
 * Si se equivoca, se lleva puesta la base de desarrollo de alguien.
 *
 * Las funciones reciben el entorno por parámetro justamente para poder probarlas
 * sin ensuciar el `process.env` del proceso de Jest.
 */
describe('nombreDeLaBaseDePrueba', () => {
  it('deriva el nombre de DB_NAME agregando el sufijo', () => {
    expect(nombreDeLaBaseDePrueba({ DB_NAME: 'smartplan' })).toBe(
      'smartplan_test',
    );
  });

  it('prioriza DB_NAME_TEST cuando está definida', () => {
    expect(
      nombreDeLaBaseDePrueba({
        DB_NAME: 'smartplan',
        DB_NAME_TEST: 'otra_base_test',
      }),
    ).toBe('otra_base_test');
  });

  it('no duplica el sufijo si DB_NAME ya lo tiene', () => {
    expect(nombreDeLaBaseDePrueba({ DB_NAME: 'smartplan_test' })).toBe(
      'smartplan_test',
    );
  });

  it('usa smartplan_test si no hay nada configurado', () => {
    expect(nombreDeLaBaseDePrueba({})).toBe('smartplan_test');
  });
});

describe('exigirSufijoDePrueba', () => {
  it('acepta un nombre que termina en _test', () => {
    expect(exigirSufijoDePrueba('smartplan_test')).toBe('smartplan_test');
  });

  it('rechaza un nombre sin el sufijo', () => {
    expect(() => exigirSufijoDePrueba('smartplan')).toThrow('smartplan');
  });

  it('rechaza caracteres que no pueden ir en un identificador de SQL', () => {
    // El nombre entra sin escapar en un CREATE DATABASE.
    expect(() =>
      exigirSufijoDePrueba('x"; DROP DATABASE smartplan; --_test'),
    ).toThrow('caracteres no permitidos');
  });
});

describe('aplicarBaseDeDatosDePrueba', () => {
  it('cambia DB_NAME por la base de prueba', () => {
    const entorno = { DB_NAME: 'smartplan', DB_HOST: 'localhost' };

    const nombre = aplicarBaseDeDatosDePrueba(entorno);

    expect(nombre).toBe('smartplan_test');
    expect(entorno.DB_NAME).toBe('smartplan_test');
  });

  it('reescribe también la base dentro de DATABASE_URL', () => {
    // Si solo se cambiaran las DB_*, una DATABASE_URL definida ganaría sobre
    // ellas (ver database.config.ts) y los tests irían a la base de desarrollo.
    const entorno = {
      DATABASE_URL: 'postgresql://usuario:clave@localhost:5433/smartplan',
      DB_NAME: 'smartplan',
    };

    aplicarBaseDeDatosDePrueba(entorno);

    expect(entorno.DATABASE_URL).toBe(
      'postgresql://usuario:clave@localhost:5433/smartplan_test',
    );
    expect(entorno.DB_NAME).toBe('smartplan_test');
  });

  it('falla si DB_NAME_TEST apunta a una base que no es de prueba', () => {
    expect(() =>
      aplicarBaseDeDatosDePrueba({ DB_NAME_TEST: 'produccion' }),
    ).toThrow('_test');
  });
});

describe('datosDeConexion', () => {
  it('sale de las variables sueltas', () => {
    expect(
      datosDeConexion({
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
      datosDeConexion({
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

  it('desescapa el usuario y la contraseña de la URL', () => {
    // Una contraseña con caracteres especiales viaja percent-encoded en la URL,
    // pero el cliente `pg` la necesita en claro.
    expect(
      datosDeConexion({
        DATABASE_URL:
          'postgresql://usuario%40smart:cla%23ve@localhost:5432/smartplan_test',
      }),
    ).toMatchObject({
      user: 'usuario@smart',
      password: 'cla#ve',
    });
  });
});
