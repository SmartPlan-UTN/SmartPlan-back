import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDatabaseOptions } from '../config/database.config';
import { EnvironmentVariables } from '../config/environment-variables';

/**
 * Conexión a PostgreSQL vía TypeORM.
 *
 * Se registra con `forRootAsync` para que la configuración se resuelva recién
 * cuando `ConfigModule` terminó de leer y validar el environment, en place de quedar
 * fijada al momento de importar el módulo.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        buildDatabaseOptions(config),
    }),
  ],
})
export class DatabaseModule {}
