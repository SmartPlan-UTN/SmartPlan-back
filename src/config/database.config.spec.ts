import { ConfigService } from '@nestjs/config';
import { construirOpcionesDeBaseDeDatos } from './database.config';
import { validarEntorno, VariablesEntorno } from './variables-entorno';

/** Claves que el esquema exige más allá de la base de datos. */
const clavesDeLaApp = {
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  RESEND_API_KEY: 're_prueba',
  EMAIL_FROM: 'no-reply@smartplan.test',
  GOOGLE_MAPS_API_KEY: 'clave-de-google-maps',
  GEMINI_API_KEY: 'clave-de-gemini',
};

const variablesSueltas = {
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_USER: 'smartplan',
  DB_PASSWORD: 'smartplan',
  DB_NAME: 'smartplan',
};

/** Pasa el entorno por la misma validación que corre al arrancar la app. */
function configDesde(
  entorno: Record<string, string>,
): ConfigService<VariablesEntorno, true> {
  return new ConfigService<VariablesEntorno, true>(
    validarEntorno({ ...clavesDeLaApp, ...entorno }),
  );
}

describe('construirOpcionesDeBaseDeDatos', () => {
  it('arma la conexión a partir de las variables sueltas', () => {
    const opciones = construirOpcionesDeBaseDeDatos(
      configDesde({ NODE_ENV: 'development', ...variablesSueltas }),
    );

    expect(opciones).toMatchObject({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'smartplan',
      password: 'smartplan',
      database: 'smartplan',
    });
  });

  it('prioriza DATABASE_URL cuando está definida', () => {
    const opciones = construirOpcionesDeBaseDeDatos(
      configDesde({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://u:c@host:5432/smartplan',
        ...variablesSueltas,
      }),
    );

    expect(opciones).toMatchObject({
      url: 'postgresql://u:c@host:5432/smartplan',
    });
    expect(opciones).not.toHaveProperty('host');
  });

  it('activa synchronize fuera de producción', () => {
    const opciones = construirOpcionesDeBaseDeDatos(
      configDesde({ NODE_ENV: 'development', ...variablesSueltas }),
    );

    expect(opciones.synchronize).toBe(true);
    expect(opciones.migrationsRun).toBe(false);
  });

  it('desactiva synchronize en producción y corre migraciones', () => {
    const opciones = construirOpcionesDeBaseDeDatos(
      configDesde({ NODE_ENV: 'production', ...variablesSueltas }),
    );

    expect(opciones.synchronize).toBe(false);
    expect(opciones.migrationsRun).toBe(true);
  });

  it('apaga el log de queries en los tests', () => {
    // El log de TypeORM tapa la salida de Jest: en `test` estorba más de lo que
    // ayuda. En desarrollo sigue encendido.
    const enPrueba = construirOpcionesDeBaseDeDatos(
      configDesde({ NODE_ENV: 'test', ...variablesSueltas }),
    );
    const enDesarrollo = construirOpcionesDeBaseDeDatos(
      configDesde({ NODE_ENV: 'development', ...variablesSueltas }),
    );

    expect(enPrueba.logging).toBe(false);
    expect(enDesarrollo.logging).toBe(true);
  });

  it('activa SSL solo cuando DB_SSL está en true', () => {
    const sinSsl = construirOpcionesDeBaseDeDatos(
      configDesde({ ...variablesSueltas, DB_SSL: 'false' }),
    );
    const conSsl = construirOpcionesDeBaseDeDatos(
      configDesde({ ...variablesSueltas, DB_SSL: 'true' }),
    );

    expect(sinSsl).toMatchObject({ ssl: false });
    expect(conSsl).toMatchObject({ ssl: { rejectUnauthorized: false } });
  });
});
