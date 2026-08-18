import { ConfigService } from '@nestjs/config';
import { config as cargarEnv } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import { construirOpcionesDeBaseDeDatos } from '../config/database.config';
import { validarEntorno, VariablesEntorno } from '../config/variables-entorno';

// El CLI de TypeORM no levanta Nest, así que el `.env` se carga y se valida a
// mano, con el mismo esquema que usa la aplicación al arrancar.
cargarEnv();

/**
 * DataSource que usa el CLI de TypeORM para generar y correr migraciones.
 * Comparte el factory con `DatabaseModule` para que la aplicación y las
 * migraciones no puedan apuntar a bases distintas.
 *
 *   pnpm migration:generate src/database/migrations/CrearUsuario
 *   pnpm migration:run
 */
const variables = validarEntorno(process.env);
const configuracion = new ConfigService<VariablesEntorno, true>(variables);

export default new DataSource(
  construirOpcionesDeBaseDeDatos(configuracion) as DataSourceOptions,
);
