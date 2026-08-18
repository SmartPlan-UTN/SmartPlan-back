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

export enum Entorno {
  Desarrollo = 'development',
  Prueba = 'test',
  Produccion = 'production',
}

/**
 * Variables que necesitan por igual la API y el worker (F12).
 *
 * Viven en una clase aparte porque los dos procesos validan esquemas
 * distintos: la API no puede arrancar sin `JWT_SECRET` ni las API keys, el
 * worker (todavía) no las usa. Heredar evita que los decoradores de las
 * claves compartidas se dupliquen entre `VariablesEntorno` y
 * `VariablesEntornoWorker` y se desincronicen — los dos procesos leen el
 * mismo `.env`.
 */
export class VariablesEntornoComunes {
  @IsEnum(Entorno)
  NODE_ENV: Entorno = Entorno.Desarrollo;

  /**
   * Conexión a RabbitMQ: amqp://usuario:clave@host:puerto
   *
   * Opcional con default, no obligatoria como `JWT_SECRET`: el default apunta
   * al contenedor que levanta `docker-compose.yml`, así que un `pnpm db:up` +
   * `pnpm start:dev` funciona sin tocar el `.env`. En Railway hay que
   * definirla con la URL de la red privada — ver docs/despliegue.md.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/^amqps?:\/\/.+/, {
    message: 'RABBITMQ_URL debe ser una URL amqp:// o amqps:// válida',
  })
  RABBITMQ_URL: string = 'amqp://smartplan:smartplan@localhost:5672';

  /** Mensajes que el worker toma a la vez de la cola. 1 = de a uno, en orden. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  RABBITMQ_PREFETCH: number = 1;

  /** Intentos totales por trabajo, incluido el primero. 3 = original + 2 reintentos. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  RABBITMQ_MAX_INTENTOS: number = 3;

  /**
   * Demoras entre reintentos, en milisegundos, separadas por coma.
   * Tiene que haber al menos RABBITMQ_MAX_INTENTOS - 1 valores.
   *
   * Se guarda como string y se parsea en mensajeria.config.ts: class-validator
   * no valida arrays que vienen de una variable de entorno sin un
   * `@Transform` que ya haga el split, y partir el parseo en dos lugares es
   * peor que tenerlo en uno.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+(,\d+)*$/, {
    message:
      'RABBITMQ_RETRY_DELAYS_MS debe ser una lista de enteros separados por coma, por ejemplo 5000,30000',
  })
  RABBITMQ_RETRY_DELAYS_MS: string = '5000,30000';
}

/**
 * Esquema de las variables de entorno de la aplicación.
 *
 * Toda clave que la app necesite tiene que estar declarada acá y en
 * `.env.example`. Si falta una o tiene un valor inválido, el arranque falla.
 */
export class VariablesEntorno extends VariablesEntornoComunes {
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3001;

  /**
   * Origen del frontend, único autorizado por CORS.
   *
   * Tiene que ser un **origen** (`esquema://host[:puerto]`), no una URL con
   * ruta ni barra final: el navegador compara el encabezado
   * `Access-Control-Allow-Origin` carácter por carácter contra el origen que
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
      'FRONTEND_URL debe ser un origen sin ruta ni barra final, por ejemplo https://app.smartplan.com',
  })
  FRONTEND_URL: string = 'http://localhost:3000';

  /**
   * Cadena de conexión a PostgreSQL: postgresql://usuario:clave@host:puerto/base
   *
   * Es lo que entrega Railway en producción. Opcional porque en desarrollo la
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

  /** Secreto para firmar los JWT. Mínimo 32 caracteres. */
  @IsString()
  @MinLength(32, {
    message: 'JWT_SECRET debe tener al menos 32 caracteres',
  })
  JWT_SECRET: string;

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
 * Valida `configuracion` contra `Esquema` con el patrón común a los dos
 * esquemas de la aplicación (API y worker, F12): descarta claves vacías,
 * convierte tipos, valida con class-validator y agrega los errores en un
 * mensaje legible. No exportado del paquete público — es un detalle de
 * implementación de `src/config/`, pero se exporta del módulo para que
 * `variables-entorno-worker.ts` lo reutilice sin duplicar este bloque.
 *
 * Los mensajes de error nombran la clave pero **nunca** imprimen su valor: el
 * log de un arranque fallido no tiene por qué filtrar un secreto.
 */
export function validarContra<T extends object>(
  Esquema: new () => T,
  configuracion: Record<string, unknown>,
): T {
  // Una clave presente pero vacía (`PORT=` en el .env) tiene que valer lo mismo
  // que una ausente: `.env.example` lista todas las claves sin valor, así que un
  // `cp .env.example .env` deja vacías las opcionales. `@IsOptional()` solo
  // ignora `undefined` y `null`, no el string vacío, así que se descartan acá.
  const sinVacios = Object.fromEntries(
    Object.entries(configuracion).filter(([, valor]) => valor !== ''),
  );

  const variables = plainToInstance(Esquema, sinVacios, {
    enableImplicitConversion: true,
  });

  const errores = validateSync(variables, { skipMissingProperties: false });

  if (errores.length > 0) {
    const detalle = errores
      .map(
        (error) =>
          `  - ${error.property}: ${Object.values(error.constraints ?? {}).join('; ')}`,
      )
      .join('\n');

    throw new Error(
      `Variables de entorno faltantes o inválidas:\n${detalle}\n` +
        `Copiá .env.example a .env y completá los valores.`,
    );
  }

  return variables;
}

/**
 * Verifica que `RABBITMQ_RETRY_DELAYS_MS` tenga al menos
 * `RABBITMQ_MAX_INTENTOS - 1` valores: un trabajo intentado N veces necesita
 * N-1 demoras de backoff entre intentos. Tipada contra la clase base
 * compartida para que la llamen los dos validadores (API y worker) sin
 * duplicar la regla.
 */
export function validarCoherenciaDeReintentos(
  variables: VariablesEntornoComunes,
): void {
  const demoras = variables.RABBITMQ_RETRY_DELAYS_MS.split(',');
  const demorasNecesarias = variables.RABBITMQ_MAX_INTENTOS - 1;

  if (demoras.length < demorasNecesarias) {
    throw new Error(
      `RABBITMQ_RETRY_DELAYS_MS tiene ${demoras.length} demora(s), pero ` +
        `RABBITMQ_MAX_INTENTOS=${variables.RABBITMQ_MAX_INTENTOS} necesita al ` +
        `menos ${demorasNecesarias}.\n` +
        `Agregá más valores separados por coma, por ejemplo 5000,30000.`,
    );
  }
}

/**
 * Valida `process.env` contra {@link VariablesEntorno} al arrancar la aplicación.
 *
 * La usa `ConfigModule.forRoot({ validate: validarEntorno })`. Prefiere fallar en
 * el arranque antes que descubrir a mitad de un request que falta una clave.
 *
 * Los mensajes de error nombran la clave pero **nunca** imprimen su valor: el
 * log de un arranque fallido no tiene por qué filtrar un secreto.
 */
export function validarEntorno(
  configuracion: Record<string, unknown>,
): VariablesEntorno {
  const variables = validarContra(VariablesEntorno, configuracion);

  // `DATABASE_URL` y las `DB_*` son opcionales por separado, pero alguna de las
  // dos formas tiene que estar completa. class-validator valida propiedad por
  // propiedad, así que esta condición cruzada se chequea acá.
  if (!variables.DATABASE_URL) {
    const faltantes = CLAVES_DB_SUELTAS.filter((clave) => !variables[clave]);

    if (faltantes.length > 0) {
      throw new Error(
        `Falta configurar la conexión a PostgreSQL.\n` +
          `  - Definí DATABASE_URL, o completá las variables sueltas.\n` +
          `  - Sin definir: ${faltantes.join(', ')}.\n` +
          `Copiá .env.example a .env y completá los valores.`,
      );
    }
  }

  validarCoherenciaDeReintentos(variables);

  return variables;
}
