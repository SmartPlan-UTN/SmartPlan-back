import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
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
 * Esquema de las variables de entorno de la aplicación.
 *
 * Toda clave que la app necesite tiene que estar declarada acá y en
 * `.env.example`. Si falta una o tiene un valor inválido, el arranque falla.
 */
export class VariablesEntorno {
  @IsEnum(Entorno)
  NODE_ENV: Entorno = Entorno.Desarrollo;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

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
  OPENAI_API_KEY: string;
}

/**
 * Valida `process.env` contra {@link VariablesEntorno} al arrancar la aplicación.
 *
 * La usa `ConfigModule.forRoot({ validate: validarEntorno })`. Prefiere fallar en
 * el arranque antes que descubrir a mitad de un request que falta una clave.
 *
 * Los mensajes de error nombran la clave pero **nunca** imprimen su valor: el log
 * de un arranque fallido no tiene por qué filtrar un secreto.
 */
export function validarEntorno(
  configuracion: Record<string, unknown>,
): VariablesEntorno {
  // Una clave presente pero vacía (`PORT=` en el .env) tiene que valer lo mismo
  // que una ausente: `.env.example` lista todas las claves sin valor, así que un
  // `cp .env.example .env` deja vacías las opcionales. `@IsOptional()` solo
  // ignora `undefined` y `null`, no el string vacío, así que se descartan acá.
  const sinVacios = Object.fromEntries(
    Object.entries(configuracion).filter(([, valor]) => valor !== ''),
  );

  const variables = plainToInstance(VariablesEntorno, sinVacios, {
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

  return variables;
}
