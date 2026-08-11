import { ConfigService } from '@nestjs/config';
import { construirOpcionesDeBaseDeDatos } from './database.config';

/** ConfigService de mentira: lee de un objeto plano en vez del entorno real. */
function configConValores(valores: Record<string, string>): ConfigService {
  return {
    get: (clave: string) => valores[clave],
  } as unknown as ConfigService;
}

const variablesSueltas = {
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_USER: 'smartplan',
  DB_PASSWORD: 'smartplan',
  DB_NAME: 'smartplan',
};

describe('construirOpcionesDeBaseDeDatos', () => {
  it('arma la conexión a partir de las variables sueltas', () => {
    const opciones = construirOpcionesDeBaseDeDatos(
      configConValores({ NODE_ENV: 'development', ...variablesSueltas }),
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
      configConValores({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://u:c@host:5432/smartplan',
        ...variablesSueltas,
      }),
    );

    expect(opciones).toMatchObject({
      url: 'postgres://u:c@host:5432/smartplan',
    });
    expect(opciones).not.toHaveProperty('host');
  });

  it('activa synchronize fuera de producción', () => {
    const opciones = construirOpcionesDeBaseDeDatos(
      configConValores({ NODE_ENV: 'development', ...variablesSueltas }),
    );

    expect(opciones.synchronize).toBe(true);
    expect(opciones.migrationsRun).toBe(false);
  });

  it('desactiva synchronize en producción y corre migraciones', () => {
    const opciones = construirOpcionesDeBaseDeDatos(
      configConValores({ NODE_ENV: 'production', ...variablesSueltas }),
    );

    expect(opciones.synchronize).toBe(false);
    expect(opciones.migrationsRun).toBe(true);
  });

  it('falla con un mensaje claro si falta configuración', () => {
    expect(() =>
      construirOpcionesDeBaseDeDatos(
        configConValores({ NODE_ENV: 'development', DB_HOST: 'localhost' }),
      ),
    ).toThrow(/DB_USER, DB_PASSWORD, DB_NAME/);
  });
});
