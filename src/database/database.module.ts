import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { construirOpcionesDeBaseDeDatos } from '../config/database.config';
import { VariablesEntorno } from '../config/variables-entorno';

/**
 * Conexión a PostgreSQL vía TypeORM.
 *
 * Se registra con `forRootAsync` para que la configuración se resuelva recién
 * cuando `ConfigModule` terminó de leer y validar el entorno, en lugar de quedar
 * fijada al momento de importar el módulo.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<VariablesEntorno, true>) =>
        construirOpcionesDeBaseDeDatos(config),
    }),
  ],
})
export class DatabaseModule {}
