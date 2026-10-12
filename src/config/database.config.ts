import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  assessDatabaseTarget,
  describeDatabaseTarget,
  isDeployedRuntime,
} from './database-target';
import { LegacyPriceSubscriber } from '../common/pricing/legacy-price.subscriber';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import {
  CommonEnvironmentVariables,
  Environment,
} from './environment-variables';

type Configuration = ConfigService<CommonEnvironmentVariables, true>;

function isTrue(value: unknown): boolean {
  return value === true || value === 'true' || value === '1';
}

const announced = new Set<string>();

export function buildDatabaseOptions(
  config: Configuration,
): TypeOrmModuleOptions {
  const environment = config.get('NODE_ENV', { infer: true });
  const isProduction = environment === Environment.Production;

  // Decide (and refuse) BEFORE any connection: a developer process must not
  // reach, synchronise or migrate a remote database because of what .env holds.
  const target = assessDatabaseTarget({
    url: config.get<string | undefined>('DATABASE_URL') || undefined,
    host: config.get<string>('DB_HOST', { infer: true }),
    port: config.get<number | string | undefined>('DB_PORT'),
    database: config.get<string | undefined>('DB_NAME'),
    allowRemoteHost: config.get<string | undefined>('ALLOW_REMOTE_DATABASE'),
    allowRemoteMigrations:
      config.get<string | undefined>('ALLOW_REMOTE_MIGRATIONS') === 'true',
    deployed: isDeployedRuntime(process.env),
  });
  const description = describeDatabaseTarget(target);
  if (!announced.has(description)) {
    announced.add(description);
    new Logger('Database').log(`Database target: ${description}`);
  }

  const commonOptions = {
    type: 'postgres' as const,
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
    subscribers: [LegacyPriceSubscriber],
    synchronize: !isProduction && target.mayChangeSchemaOutsideMigrations,
    migrationsRun: isProduction && target.mayRunMigrations,
    // TypeORM must never write SQL or bound parameters to application logs.
    // Services and the HTTP filter log safe, contextual application errors.
    logging: false,
    ssl: isTrue(config.get('DB_SSL', { infer: true }))
      ? { rejectUnauthorized: false }
      : false,
  };

  const url = config.get('DATABASE_URL', { infer: true });
  if (url) {
    return { ...commonOptions, url };
  }

  return {
    ...commonOptions,
    host: config.get<string>('DB_HOST', { infer: true }),
    port: Number(config.get<number>('DB_PORT', { infer: true }) ?? 5432),
    username: config.get<string>('DB_USER', { infer: true }),
    password: config.get<string>('DB_PASSWORD', { infer: true }),
    database: config.get<string>('DB_NAME', { infer: true }),
  };
}
