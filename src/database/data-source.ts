import { ConfigService } from '@nestjs/config';
import { config as loadEnvironment } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import { buildDatabaseOptions } from '../config/database.config';
import {
  validateEnvironment,
  EnvironmentVariables,
} from '../config/environment-variables';

loadEnvironment();

const environmentVariables = validateEnvironment(process.env);
const configuration = new ConfigService<EnvironmentVariables, true>(
  environmentVariables,
);

export default new DataSource(
  buildDatabaseOptions(configuration) as DataSourceOptions,
);
