import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

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

  /** Cadena de conexión a PostgreSQL: postgresql://usuario:clave@host:puerto/base */
  @IsString()
  @IsNotEmpty()
  @Matches(/^postgres(ql)?:\/\/.+/, {
    message: 'DATABASE_URL debe ser una URL postgresql:// válida',
  })
  DATABASE_URL: string;

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
  const variables = plainToInstance(VariablesEntorno, configuracion, {
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
