import { ConfigService } from '@nestjs/config';
import { config as cargarEnv } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import { buildDatabaseOptions } from '../config/database.config';
import {
  validateEnvironment,
  EnvironmentVariables,
} from '../config/environment-variables';

// El CLI de TypeORM no levanta Nest, así que el `.env` se carga y se valida a
// mano, con el mismo esquema que usa la aplicación al arrancar.
cargarEnv();

/**
 * DataSource que usa el CLI de TypeORM para generar y correr migraciones.
 * Comparte el factory con `DatabaseModule` para que la aplicación y las
 * migraciones no puedan apuntar a bases distintas.
 *
 *   pnpm migration:generate src/database/migrations/CrearUser
 *   pnpm migration:run
 */
const variables = validateEnvironment(process.env);
const configuration = new ConfigService<EnvironmentVariables, true>(variables);

export default new DataSource(
  buildDatabaseOptions(configuration) as DataSourceOptions,
);
