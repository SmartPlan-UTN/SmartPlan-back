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

  @IsString()
  @IsNotEmpty()
  GEMINI_API_KEY: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  GEMINI_MODEL: string = 'gemini-3.6-flash';
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

export function validateEnvironment(
  configuration: Record<string, unknown>,
): EnvironmentVariables {
  const variables = validateAgainst(EnvironmentVariables, configuration);

  validateDatabaseConsistency(variables);

  if (variables.JWT_ACCESS_SECRET === variables.JWT_REFRESH_SECRET) {
    throw new Error(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different secrets.',
    );
  }

  validateRetryConsistency(variables);

  return variables;
}
