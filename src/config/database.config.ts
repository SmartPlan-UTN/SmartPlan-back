import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { Environment, EnvironmentVariables } from './environment-variables';

type Configuration = ConfigService<EnvironmentVariables, true>;

function isTrue(value: unknown): boolean {
  return value === true || value === 'true' || value === '1';
}

export function buildDatabaseOptions(
  config: Configuration,
): TypeOrmModuleOptions {
  const environment = config.get('NODE_ENV', { infer: true });
  const isProduction = environment === Environment.Production;
  const isTest = environment === Environment.Test;

  const commonOptions = {
    type: 'postgres' as const,
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
    synchronize: !isProduction,
    migrationsRun: isProduction,
    logging: !isProduction && !isTest,
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
