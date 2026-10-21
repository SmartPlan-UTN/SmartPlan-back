import { plainToInstance, Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
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

  // --- Database safety ----------------------------------------------------

  /**
   * Exact remote database host a NON-deployed process may use (explicit,
   * per-process opt-in). Without it, a process outside the deployment platform
   * refuses any remote database, whatever `.env` contains.
   */
  @IsOptional()
  @IsString()
  ALLOW_REMOTE_DATABASE?: string;

  /** Lets a non-deployed process run migrations on an opted-in remote database. */
  @IsOptional()
  @IsIn(['true', 'false'])
  ALLOW_REMOTE_MIGRATIONS?: string;

  // --- Catalog platform ---------------------------------------------------

  /** Lowest price confidence automatic recommendation accepts. */
  @IsOptional()
  @IsIn(['NONE', 'LOW', 'MEDIUM', 'HIGH'])
  CATALOG_AUTO_RECOMMEND_MIN_PRICE_CONFIDENCE:
    | 'NONE'
    | 'LOW'
    | 'MEDIUM'
    | 'HIGH' = 'LOW';

  /**
   * Oldest verified price (days) automatic recommendation accepts. 90 is the
   * steady-state policy; a bootstrap catalog may raise it per environment while
   * fresher evidence accumulates. Prices older than 90 days are still shown as
   * stale to people.
   */
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(730)
  CATALOG_AUTO_RECOMMEND_MAX_PRICE_AGE_DAYS: number = 90;

  // --- Google Maps Platform cost and terms guard --------------------------

  /** Days cached Google coordinates/ratings may live (terms allow at most 30). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  GOOGLE_CACHE_TTL_DAYS: number = 28;

  /** Application kill switch: `false` stops every paid Google call. */
  @IsOptional()
  @Transform(({ obj }: { obj: Record<string, unknown> }) => {
    const raw = obj.GOOGLE_PLACES_ENABLED;
    if (raw === undefined || raw === null) return true;
    return raw === true || raw === 'true' || raw === '1';
  })
  @IsBoolean()
  GOOGLE_PLACES_ENABLED?: boolean = true;

  /** Safety budget for bulk catalog/sync calls, in USD per calendar month. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  GOOGLE_CATALOG_MONTHLY_BUDGET_USD: number = 25;

  /**
   * USD 0 cap on billed Google photo URIs per calendar month. Clamped to at
   * most 900 (Google grants 1,000 free): it can only be lowered.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(900)
  GOOGLE_PHOTO_MONTHLY_CAP: number = 900;

  /**
   * USD 0 cap on Places UI Kit element instantiations per calendar month.
   * Clamped to at most 9,000 (Google grants 10,000 free).
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9000)
  GOOGLE_UI_KIT_MONTHLY_CAP: number = 9000;

  /** Client-side cap on outgoing Google requests per second. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  GOOGLE_MAX_REQUESTS_PER_SECOND: number = 5;

  @IsString()
  @IsNotEmpty()
  GEMINI_API_KEY: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  GEMINI_MODEL: string = 'gemini-3.6-flash';

  /**
   * Optional override for `interpretIntent` specifically — a simpler,
   * structured-extraction task than `composePlans`'s creative generation,
   * which may tolerate a lighter/faster Gemini tier. Falls back to
   * `GEMINI_MODEL` when unset, so this ships with zero behavior change
   * until a value is actually configured.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  GEMINI_MODEL_INTENT?: string;
}

export class EnvironmentVariables extends CommonEnvironmentVariables {
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  S3_ENDPOINT?: string;
  @IsOptional() @IsString() @IsNotEmpty() S3_REGION?: string = 'auto';
  @IsOptional() @IsString() @IsNotEmpty() S3_BUCKET?: string;
  @IsOptional() @IsString() @IsNotEmpty() S3_ACCESS_KEY_ID?: string;
  @IsOptional() @IsString() @IsNotEmpty() S3_SECRET_ACCESS_KEY?: string;
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

  /**
   * Optional allow-list for browser origins that may call the API. When it is
   * absent, the canonical frontend URL is the only allowed origin. Keeping
   * this separate from FRONTEND_URL avoids turning password-recovery links
   * into an ambiguous list of destinations.
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.split(',').map((origin) => origin.trim())
      : value,
  )
  @IsArray()
  @ArrayNotEmpty()
  @IsUrl(
    {
      protocols: ['http', 'https'],
      require_protocol: true,
      require_tld: false,
    },
    { each: true },
  )
  @Matches(/^https?:\/\/[^/]+$/, {
    each: true,
    message:
      'CORS_ORIGINS entries must be origins without a path or trailing slash, for example https://app.smartplan.com',
  })
  CORS_ORIGINS?: string[];

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

  // Reminder emails (#127), see docs/reminder-emails.md. Every replica may
  // run the scheduler: the outbox deduplicates, so the switch is a kill
  // switch, not a single-instance guard.
  @IsOptional()
  @Transform(({ obj }: { obj: Record<string, unknown> }) => {
    const raw = obj.REMINDER_EMAILS_ENABLED;
    if (raw === undefined || raw === null) {
      return true;
    }
    return raw === true || raw === 'true' || raw === '1';
  })
  @IsBoolean()
  REMINDER_EMAILS_ENABLED?: boolean = true;

  /** Days without creating a plan or a plan request before the reminder. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  REMINDER_INACTIVITY_DAYS: number = 30;

  /** Frequency cap: minimum days between two inactivity reminders. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  REMINDER_INACTIVITY_MIN_INTERVAL_DAYS: number = 30;

  /** Outings completed longer ago than this are not reminded by email. */
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(90)
  REMINDER_FEEDBACK_MAX_AGE_DAYS: number = 14;

  /** Total send attempts per reminder, including the first. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  REMINDER_EMAIL_MAX_ATTEMPTS: number = 5;

  /** Reminders claimed per scheduler tick (provider rate limits). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  REMINDER_EMAIL_BATCH_SIZE: number = 50;

  /**
   * Owner of the plans the MCP loader creates (`src/mcp`). Optional: without
   * it, the first administrator (lowest id) owns them.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  MCP_OWNER_USER_ID?: number;
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
