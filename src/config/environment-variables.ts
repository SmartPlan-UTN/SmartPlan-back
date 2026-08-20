import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

/** Claves que hay que tener completas si no se usa `DATABASE_URL`. */
const CLAVES_DB_SUELTAS = [
  'DB_HOST',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
] as const;

export enum Environment {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

/**
 * Variables que necesitan por igual la API y el worker (F12).
 *
 * Viven en una clase aparte porque los dos procesos validan esquemas
 * distintos: la API no puede arrancar sin `JWT_SECRET` ni las API keys, el
 * worker (todavía) no las usa. Heredar evita que los decoradores de las
 * claves compartidas se dupliquen entre `EnvironmentVariables` y
 * `WorkerEnvironmentVariables` y se desincronicen — los dos procesos leen el
 * mismo `.env`.
 */
export class CommonEnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  /**
   * Conexión a RabbitMQ: amqp://user:key@host:puerto
   *
   * Opcional con default, no obligatoria como `JWT_SECRET`: el default apunta
   * al container que levanta `docker-compose.yml`, así que un `pnpm db:up` +
   * `pnpm start:dev` funciona sin tocar el `.env`. En Railway hay que
   * definirla con la URL de la red privada — ver docs/deployment.md.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/^amqps?:\/\/.+/, {
    message: 'RABBITMQ_URL debe ser una URL amqp:// o amqps:// válida',
  })
  RABBITMQ_URL: string = 'amqp://smartplan:smartplan@localhost:5672';

  /** Messages que el worker toma a la vez de la queue. 1 = de a uno, en order. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  RABBITMQ_PREFETCH: number = 1;

  /** Intentos totales por job, incluido el primero. 3 = original + 2 reattempts. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  RABBITMQ_MAX_INTENTOS: number = 3;

  /**
   * Demoras entre reattempts, en milisegundos, separadas por coma.
   * Tiene que haber exactamente RABBITMQ_MAX_INTENTOS - 1 valores: cada
   * demora declara una queue de retry física (ver
   * `buildMessagingOptions` en `messaging.config.ts`).
   *
   * Se guarda como string y se parsea en messaging.config.ts: class-validator
   * no valida arrays que vienen de una variable de environment sin un
   * `@Transform` que ya haga el split, y partir el parseo en dos places es
   * peor que tenerlo en uno.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+(,\d+)*$/, {
    message:
      'RABBITMQ_RETRY_DELAYS_MS debe ser una list de enteros separados por coma, por ejemplo 5000,30000',
  })
  RABBITMQ_RETRY_DELAYS_MS: string = '5000,30000';
}

/**
 * Esquema de las variables de environment de la aplicación.
 *
 * Toda key que la app necesite tiene que estar declarada acá y en
 * `.env.example`. Si falta una o tiene un value inválido, el arranque falla.
 */
export class EnvironmentVariables extends CommonEnvironmentVariables {
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3001;

  /**
   * Origen del frontend, único autorizado por CORS.
   *
   * Tiene que ser un **origen** (`esquema://host[:puerto]`), no una URL con
   * route ni navbar final: el navegador compara el encabezado
   * `Access-Controle-Allow-Origin` carácter por carácter contra el origen que
   * envió. Un `https://app.smartplan.com/` de más arrancaría sin quejarse y
   * después bloquearía todas las peticiones del frontend con un error de CORS
   * que no dice por qué. Mejor no arrancar.
   */
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  @Matches(/^https?:\/\/[^/]+$/, {
    message:
      'FRONTEND_URL debe ser un origen sin route ni navbar final, por ejemplo https://app.smartplan.com',
  })
  FRONTEND_URL: string = 'http://localhost:3000';

  /**
   * Cadena de conexión a PostgreSQL: postgresql://user:key@host:puerto/base
   *
   * Es lo que entrega Railway en producción. Opcional porque en desarrolelo la
   * conexión se puede armar con las `DB_*` de abajo, que son las mismas que
   * consume `docker-compose.yml`. Tiene que estar una de las dos formas: si
   * están las dos, gana esta.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/^postgres(ql)?:\/\/.+/, {
    message: 'DATABASE_URL debe ser una URL postgresql:// válida',
  })
  DATABASE_URL?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  DB_HOST?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  DB_PORT?: number = 5432;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  DB_USER?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  DB_PASSWORD?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  DB_NAME?: string;

  /**
   * SSL contra la base. Railway lo necesita; en Docker local va en false.
   *
   * El `@Transform` es necesario: la conversión implícita de class-transformer
   * resuelve `Boolean('false')`, que es `true`. Acá solo `'true'` y `'1'`
   * activan el SSL.
   *
   * Lee de `obj` y no de `value` porque `value` ya viene con la conversión
   * implícita aplicada — es decir, ya arruinada.
   */
  @IsOptional()
  @Transform(({ obj }: { obj: Record<string, unknown> }) => {
    const crudo = obj.DB_SSL;
    return crudo === true || crudo === 'true' || crudo === '1';
  })
  @IsBoolean()
  DB_SSL?: boolean = false;

  /** Secret used exclusively for access JWTs. Minimum 32 characters. */
  @IsString()
  @MinLength(32, {
    message: 'JWT_ACCESS_SECRET must contain at least 32 characters',
  })
  JWT_ACCESS_SECRET: string;

  /** Secret used exclusively for refresh JWTs. It must differ from access. */
  @IsString()
  @MinLength(32, {
    message: 'JWT_REFRESH_SECRET must contain at least 32 characters',
  })
  JWT_REFRESH_SECRET: string;

  @IsString()
  @IsNotEmpty()
  RESEND_API_KEY: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
    message: 'EMAIL_FROM must be a valid email address',
  })
  EMAIL_FROM: string;

  @IsString()
  @IsNotEmpty()
  GOOGLE_MAPS_API_KEY: string;

  @IsString()
  @IsNotEmpty()
  GEMINI_API_KEY: string;

  /** Modelo Gemini a usar. Configurable para comparar modelos sin tocar código. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  GEMINI_MODEL: string = 'gemini-3.6-flash';
}

/**
 * Valida `configuration` contra `Esquema` con el patrón común a los dos
 * esquemas de la aplicación (API y worker, F12): descarta claves vacías,
 * convierte types, valida con class-validator y agrega los errors en un
 * message legible. No exportado del paquete público — es un detail de
 * implementación de `src/config/`, pero se exporta del módulo para que
 * `worker-environment-variables.ts` lo reutilice sin duplicar este bloque.
 *
 * Los messages de error nombran la key pero **nunca** imprimen su value: el
 * log de un arranque failed no tiene por qué filtrar un secret.
 */
export function validateAgainst<T extends object>(
  Esquema: new () => T,
  configuration: Record<string, unknown>,
): T {
  // Una key presente pero vacía (`PORT=` en el .env) tiene que valer lo mismo
  // que una ausente: `.env.example` list todas las claves sin value, así que un
  // `cp .env.example .env` deja vacías las opcionales. `@IsOptional()` solo
  // ignora `undefined` y `null`, no el string vacío, así que se descartan acá.
  const sinVacios = Object.fromEntries(
    Object.entries(configuration).filter(([, value]) => value !== ''),
  );

  const variables = plainToInstance(Esquema, sinVacios, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(variables, { skipMissingProperties: false });

  if (errors.length > 0) {
    const detail = errors
      .map(
        (error) =>
          `  - ${error.property}: ${Object.values(error.constraints ?? {}).join('; ')}`,
      )
      .join('\n');

    throw new Error(
      `Variables de environment faltantes o inválidas:\n${detail}\n` +
        `Copiá .env.example a .env y completá los valores.`,
    );
  }

  return variables;
}

/**
 * Verifica que `RABBITMQ_RETRY_DELAYS_MS` tenga **exactamente**
 * `RABBITMQ_MAX_INTENTOS - 1` valores: un job intentado N veces necesita
 * N-1 demoras de backoff entre attempts, y `buildMessagingOptions`
 * (`src/messaging/messaging.config.ts`) declara exactamente una queue de
 * retry física por cada elemento de `retryDelaysMs`. Antes esto solo exigía un
 * mínimo (`>=`): con más attempts configurados que demoras, el attempt
 * sobrante republicaba a una routing key sin queue/binding, que en un
 * exchange direct se confirma igual — el job desaparecía en silencio en
 * vez de terminar en la DLQ. Tipada contra la clase base compartida para que
 * la llamen los dos validadores (API y worker) sin duplicar la regla.
 */
export function validateRetryConsistency(
  variables: CommonEnvironmentVariables,
): void {
  const demoras = variables.RABBITMQ_RETRY_DELAYS_MS.split(',');
  const demorasNecesarias = variables.RABBITMQ_MAX_INTENTOS - 1;

  if (demoras.length !== demorasNecesarias) {
    throw new Error(
      `RABBITMQ_RETRY_DELAYS_MS tiene ${demoras.length} demora(s), pero ` +
        `RABBITMQ_MAX_INTENTOS=${variables.RABBITMQ_MAX_INTENTOS} necesita ` +
        `exactamente ${demorasNecesarias}: cada demora declara una queue de ` +
        `retry física, y un attempt sin queue correspondiente pierde el ` +
        `job en silencio.\n` +
        `Ajustá la quantity de valores separados por coma, por ejemplo 5000,30000.`,
    );
  }
}

/**
 * Valida `process.env` contra {@link EnvironmentVariables} al arrancar la aplicación.
 *
 * La usa `ConfigModule.forRoot({ validate: validateEnvironment })`. Prefiere fallar en
 * el arranque antes que descubrir a mitad de un request que falta una key.
 *
 * Los messages de error nombran la key pero **nunca** imprimen su value: el
 * log de un arranque failed no tiene por qué filtrar un secret.
 */
export function validateEnvironment(
  configuration: Record<string, unknown>,
): EnvironmentVariables {
  const variables = validateAgainst(EnvironmentVariables, configuration);

  // `DATABASE_URL` y las `DB_*` son opcionales por separado, pero alguna de las
  // dos formas tiene que estar completa. class-validator valida property por
  // property, así que esta condición cruzada se chequea acá.
  if (!variables.DATABASE_URL) {
    const faltantes = CLAVES_DB_SUELTAS.filter((key) => !variables[key]);

    if (faltantes.length > 0) {
      throw new Error(
        `Falta configurar la conexión a PostgreSQL.\n` +
          `  - Definí DATABASE_URL, o completá las variables sueltas.\n` +
          `  - Sin definir: ${faltantes.join(', ')}.\n` +
          `Copiá .env.example a .env y completá los valores.`,
      );
    }
  }

  if (variables.JWT_ACCESS_SECRET === variables.JWT_REFRESH_SECRET) {
    throw new Error(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different secrets.',
    );
  }

  validateRetryConsistency(variables);

  return variables;
}
