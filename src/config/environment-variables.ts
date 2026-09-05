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

const INDIVIDUAL_DB_KEYS = [
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
 * How a transactional email leaves the API.
 *
 * `resend` delivers through the provider and is the only transport a
 * deployed environment may use. `log` writes the message to the
 * application log instead of sending it, so password recovery (CU3) can
 * be exercised on a laptop without a provider account: the recovery link
 * is the only thing standing between a developer and the reset screen,
 * and it used to be unreachable without a real API key.
 *
 * `log` prints a single-use password-recovery link in clear text, which
 * is exactly why `validateEmailConsistency` refuses it in production.
 */
export enum EmailTransport {
  Resend = 'resend',
  Log = 'log',
}

export class CommonEnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/^amqps?:\/\/.+/, {
    message: 'RABBITMQ_URL must be a valid amqp:// or amqps:// URL',
  })
  RABBITMQ_URL: string = 'amqp://smartplan:smartplan@localhost:5672';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  RABBITMQ_PREFETCH: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  RABBITMQ_MAX_ATTEMPTS: number = 3;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+(,\d+)*$/, {
    message:
      'RABBITMQ_RETRY_DELAYS_MS must be a comma-separated list of integers, for example 5000,30000',
  })
  RABBITMQ_RETRY_DELAYS_MS: string = '5000,30000';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/^postgres(ql)?:\/\/.+/, {
    message: 'DATABASE_URL must be a valid postgresql:// URL',
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

  @IsOptional()
  @Transform(({ obj }: { obj: Record<string, unknown> }) => {
    const raw = obj.DB_SSL;
    return raw === true || raw === 'true' || raw === '1';
  })
  @IsBoolean()
  DB_SSL?: boolean = false;

  // Google Maps and Gemini are used by both processes: the API composes
  // suggestions (CU31) and the worker runs plan generation (CU17-CU23), which
  // calls Gemini and Google Maps directly.
  @IsString()
  @IsNotEmpty()
  GOOGLE_MAPS_API_KEY: string;

  @IsString()
  @IsNotEmpty()
  GEMINI_API_KEY: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  GEMINI_MODEL: string = 'gemini-3.6-flash';
}

export class EnvironmentVariables extends CommonEnvironmentVariables {
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3001;

  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  @Matches(/^https?:\/\/[^/]+$/, {
    message:
      'FRONTEND_URL must be an origin without a path or trailing slash, for example https://app.smartplan.com',
  })
  FRONTEND_URL: string = 'http://localhost:3000';

  @IsString()
  @MinLength(32, {
    message: 'JWT_ACCESS_SECRET must contain at least 32 characters',
  })
  JWT_ACCESS_SECRET: string;

  @IsString()
  @MinLength(32, {
    message: 'JWT_REFRESH_SECRET must contain at least 32 characters',
  })
  JWT_REFRESH_SECRET: string;

  @IsOptional()
  @IsEnum(EmailTransport)
  EMAIL_TRANSPORT: EmailTransport = EmailTransport.Resend;

  // Optional here and required by `validateEmailConsistency` instead: the
  // key is only meaningful for the `resend` transport, and demanding one
  // to boot with `log` would defeat the point of that transport.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  RESEND_API_KEY?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
    message: 'EMAIL_FROM must be a valid email address',
  })
  EMAIL_FROM: string;

  // The nightly external sync must be triggered by a single instance: with
  // several API replicas every one of them would fire its own full run.
  @IsOptional()
  @Transform(({ obj }: { obj: Record<string, unknown> }) => {
    const raw = obj.EXTERNAL_SYNC_SCHEDULER_ENABLED;
    if (raw === undefined || raw === null) {
      return true;
    }
    return raw === true || raw === 'true' || raw === '1';
  })
  @IsBoolean()
  EXTERNAL_SYNC_SCHEDULER_ENABLED?: boolean = true;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  MAX_ACTIVE_PLAN_REQUESTS_PER_USER: number = 3;
}

export function validateAgainst<T extends object>(
  Schema: new () => T,
  configuration: Record<string, unknown>,
): T {
  const nonEmptyValues = Object.fromEntries(
    Object.entries(configuration).filter(([, value]) => value !== ''),
  );

  const variables = plainToInstance(Schema, nonEmptyValues, {
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
      `Missing or invalid environment variables:\n${detail}\n` +
        `Copy .env.example to .env and complete the values.`,
    );
  }

  return variables;
}

export function validateRetryConsistency(
  variables: CommonEnvironmentVariables,
): void {
  const delays = variables.RABBITMQ_RETRY_DELAYS_MS.split(',');
  const requiredDelays = variables.RABBITMQ_MAX_ATTEMPTS - 1;

  if (delays.length !== requiredDelays) {
    throw new Error(
      `RABBITMQ_RETRY_DELAYS_MS has ${delays.length} delay(s), but ` +
        `RABBITMQ_MAX_ATTEMPTS=${variables.RABBITMQ_MAX_ATTEMPTS} requires ` +
        `exactly ${requiredDelays}: each delay declares a physical retry queue, ` +
        `and an attempt without a corresponding queue silently loses the job.\n` +
        `Adjust the number of comma-separated values, for example 5000,30000.`,
    );
  }
}

export function validateDatabaseConsistency(
  variables: CommonEnvironmentVariables,
): void {
  if (!variables.DATABASE_URL) {
    const missing = INDIVIDUAL_DB_KEYS.filter((key) => !variables[key]);

    if (missing.length > 0) {
      throw new Error(
        `The PostgreSQL connection is not configured.\n` +
          `  - Define DATABASE_URL or complete the individual variables.\n` +
          `  - Missing: ${missing.join(', ')}.\n` +
          `Copy .env.example to .env and complete the values.`,
      );
    }
  }
}

/**
 * The email transport and the credentials it needs have to agree.
 *
 * Two failures are worth catching at boot rather than at the first person
 * who forgets their password: a deployment that selected the `log`
 * transport, which would print single-use recovery links into the
 * application log and never send anything; and the `resend` transport
 * without a key, which used to boot happily and fail with an opaque 503
 * on the first request.
 */
export function validateEmailConsistency(
  variables: EnvironmentVariables,
): void {
  if (variables.EMAIL_TRANSPORT === EmailTransport.Log) {
    if (variables.NODE_ENV === Environment.Production) {
      throw new Error(
        `EMAIL_TRANSPORT=log cannot be used in production.\n` +
          `  - It writes password-recovery links to the application log ` +
          `instead of emailing them, so anyone who can read the log can ` +
          `take over an account.\n` +
          `  - Set EMAIL_TRANSPORT=resend and provide RESEND_API_KEY.`,
      );
    }
    return;
  }

  if (!variables.RESEND_API_KEY) {
    throw new Error(
      `EMAIL_TRANSPORT=resend requires RESEND_API_KEY.\n` +
        `  - Without it the API boots but password recovery (CU3) fails ` +
        `with 503 EMAIL_SERVICE_UNAVAILABLE on every attempt.\n` +
        `  - For local development set EMAIL_TRANSPORT=log instead: it ` +
        `writes the recovery link to the log and needs no account.`,
    );
  }
}

export function validateEnvironment(
  configuration: Record<string, unknown>,
): EnvironmentVariables {
  const variables = validateAgainst(EnvironmentVariables, configuration);

  validateDatabaseConsistency(variables);
  validateEmailConsistency(variables);

  if (variables.JWT_ACCESS_SECRET === variables.JWT_REFRESH_SECRET) {
    throw new Error(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different secrets.',
    );
  }

  validateRetryConsistency(variables);

  return variables;
}
