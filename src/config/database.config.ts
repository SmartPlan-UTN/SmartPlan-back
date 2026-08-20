import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { Environment, EnvironmentVariables } from './environment-variables';

type Configuracion = ConfigService<EnvironmentVariables, true>;

/**
 * Construye las options de conexión a PostgreSQL a partir del environment.
 *
 * El environment ya viene validado por `validateEnvironment` (ver `environment-variables.ts`),
 * así que acá no hace falta volver a chequear que las claves estén: si el proceso
 * llegó hasta este punto, o hay `DATABASE_URL` o están completas las `DB_*`.
 *
 * Si están las dos formas, gana `DATABASE_URL`.
 */
/**
 * `ConfigModule` está registrado con `cache: true`, así que `ConfigService`
 * devuelve el value crudo de `process.env` — un string — y no el que dejó
 * tipado `validateEnvironment`. Para los booleanos eso importa: `'false'` es un
 * string no vacío y por lo tanto truthy.
 */
function esVerdadero(value: unknown): boolean {
  return value === true || value === 'true' || value === '1';
}

export function buildDatabaseOptions(
  config: Configuracion,
): TypeOrmModuleOptions {
  const environment = config.get('NODE_ENV', { infer: true });
  const esProduccion = environment === Environment.Produccion;
  const esPrueba = environment === Environment.Prueba;

  const optionsComunes = {
    type: 'postgres' as const,
    // Las entities se descubren por convención: `*.entity.ts` dentro de `src/`.
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
    // `synchronize` reescribe el esquema a partir de las entities. Es cómodo
    // mientras el model cambia todos los días, pero puede borrar data: en
    // producción el esquema se mueve solo con migraciones.
    synchronize: !esProduccion,
    migrationsRun: esProduccion,
    // En los tests el log de queries es ruido: cada e2e imprime decenas de
    // líneas de TypeORM que tapan qué test falló y por qué.
    logging: !esProduccion && !esPrueba,
    ssl: esVerdadero(config.get('DB_SSL', { infer: true }))
      ? { rejectUnauthorized: false }
      : false,
  };

  const url = config.get('DATABASE_URL', { infer: true });
  if (url) {
    return { ...optionsComunes, url };
  }

  return {
    ...optionsComunes,
    host: config.get<string>('DB_HOST', { infer: true }),
    port: Number(config.get<number>('DB_PORT', { infer: true }) ?? 5432),
    username: config.get<string>('DB_USER', { infer: true }),
    password: config.get<string>('DB_PASSWORD', { infer: true }),
    database: config.get<string>('DB_NAME', { infer: true }),
  };
}
