import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { Entorno, VariablesEntorno } from './variables-entorno';

type Configuracion = ConfigService<VariablesEntorno, true>;

/**
 * Construye las opciones de conexión a PostgreSQL a partir del entorno.
 *
 * El entorno ya viene validado por `validarEntorno` (ver `variables-entorno.ts`),
 * así que acá no hace falta volver a chequear que las claves estén: si el proceso
 * llegó hasta este punto, o hay `DATABASE_URL` o están completas las `DB_*`.
 *
 * Si están las dos formas, gana `DATABASE_URL`.
 */
/**
 * `ConfigModule` está registrado con `cache: true`, así que `ConfigService`
 * devuelve el valor crudo de `process.env` — un string — y no el que dejó
 * tipado `validarEntorno`. Para los booleanos eso importa: `'false'` es un
 * string no vacío y por lo tanto truthy.
 */
function esVerdadero(valor: unknown): boolean {
  return valor === true || valor === 'true' || valor === '1';
}

export function construirOpcionesDeBaseDeDatos(
  config: Configuracion,
): TypeOrmModuleOptions {
  const esProduccion =
    config.get('NODE_ENV', { infer: true }) === Entorno.Produccion;

  const opcionesComunes = {
    type: 'postgres' as const,
    // Las entidades se descubren por convención: `*.entity.ts` dentro de `src/`.
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
    // `synchronize` reescribe el esquema a partir de las entidades. Es cómodo
    // mientras el modelo cambia todos los días, pero puede borrar datos: en
    // producción el esquema se mueve solo con migraciones.
    synchronize: !esProduccion,
    migrationsRun: esProduccion,
    logging: !esProduccion,
    ssl: esVerdadero(config.get('DB_SSL', { infer: true }))
      ? { rejectUnauthorized: false }
      : false,
  };

  const url = config.get('DATABASE_URL', { infer: true });
  if (url) {
    return { ...opcionesComunes, url };
  }

  return {
    ...opcionesComunes,
    host: config.get<string>('DB_HOST', { infer: true }),
    port: Number(config.get<number>('DB_PORT', { infer: true }) ?? 5432),
    username: config.get<string>('DB_USER', { infer: true }),
    password: config.get<string>('DB_PASSWORD', { infer: true }),
    database: config.get<string>('DB_NAME', { infer: true }),
  };
}
