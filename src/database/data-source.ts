import { ConfigService } from '@nestjs/config';
import { config as loadEnvironment } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import { buildDatabaseOptions } from '../config/database.config';
import {
  validateEnvironment,
  EnvironmentVariables,
} from '../config/environment-variables';

// Same precedence as the application: .env.local first (dotenv never
// overrides a variable that is already set).
loadEnvironment({ path: '.env.local', quiet: true });
loadEnvironment({ quiet: true });

const environmentVariables = validateEnvironment(process.env);
const configuration = new ConfigService<EnvironmentVariables, true>(
  environmentVariables,
);

export default new DataSource(
  buildDatabaseOptions(configuration) as DataSourceOptions,
);
