import { config as cargarEnv } from 'dotenv';
import { ConfigService } from '@nestjs/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import { construirOpcionesDeBaseDeDatos } from '../config/database.config';

// El CLI de TypeORM no levanta Nest, así que el `.env` se carga a mano.
cargarEnv();

/**
 * DataSource que usa el CLI de TypeORM para generar y correr migraciones.
 * Comparte el factory con `DatabaseModule` para que la aplicación y las
 * migraciones no puedan apuntar a bases distintas.
 *
 *   pnpm migration:generate src/database/migrations/CrearUsuario
 *   pnpm migration:run
 */
const opciones = construirOpcionesDeBaseDeDatos(
  new ConfigService(),
) as DataSourceOptions;

export default new DataSource(opciones);
