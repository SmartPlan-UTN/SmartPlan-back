import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSourceOptions } from 'typeorm';

/**
 * Construye las opciones de conexión a PostgreSQL a partir del entorno.
 *
 * Acepta dos formas de configurar la conexión:
 *
 * 1. `DATABASE_URL` — una URL completa (`postgres://usuario:clave@host:puerto/base`).
 *    Es lo que entrega Railway en producción.
 * 2. Variables sueltas `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.
 *    Más cómodo en desarrollo, porque son las mismas que consume `docker-compose.yml`.
 *
 * Si están las dos, gana `DATABASE_URL`.
 */
export function construirOpcionesDeBaseDeDatos(
  config: ConfigService,
): TypeOrmModuleOptions {
  const entorno = config.get<string>('NODE_ENV') ?? 'development';
  const esProduccion = entorno === 'production';

  const opcionesComunes = {
    type: 'postgres',
    // Las entidades se descubren por convención: `*.entity.ts` dentro de `src/`.
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
    // `synchronize` reescribe el esquema a partir de las entidades. Es cómodo
    // mientras el modelo cambia todos los días, pero puede borrar datos: en
    // producción el esquema se mueve solo con migraciones.
    synchronize: !esProduccion,
    migrationsRun: esProduccion,
    logging: !esProduccion,
    ssl:
      config.get<string>('DB_SSL') === 'true'
        ? { rejectUnauthorized: false }
        : false,
  } satisfies Partial<DataSourceOptions> & Record<string, unknown>;

  const url = config.get<string>('DATABASE_URL');
  if (url) {
    return { ...opcionesComunes, url } as TypeOrmModuleOptions;
  }

  const faltantes = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'].filter(
    (clave) => !config.get<string>(clave),
  );

  if (faltantes.length > 0) {
    throw new Error(
      `Falta configurar la conexión a PostgreSQL. Definí DATABASE_URL o las variables sueltas; ` +
        `no están: ${faltantes.join(', ')}. Copiá .env.example a .env (ver README).`,
    );
  }

  return {
    ...opcionesComunes,
    host: config.get<string>('DB_HOST'),
    port: Number(config.get<string>('DB_PORT') ?? 5432),
    username: config.get<string>('DB_USER'),
    password: config.get<string>('DB_PASSWORD'),
    database: config.get<string>('DB_NAME'),
  } as TypeOrmModuleOptions;
}
