import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDatabaseOptions } from '../config/database.config';
import { WorkerEnvironmentVariables } from '../config/worker-environment-variables';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (
        config: ConfigService<WorkerEnvironmentVariables, true>,
      ) => ({
        ...buildDatabaseOptions(config),
        // Schema management belongs to the API process. Without this the worker
        // would race it on DDL (synchronize in development) and on the
        // migrations table (migrationsRun in production).
        synchronize: false,
        migrationsRun: false,
      }),
    }),
  ],
})
export class WorkerDatabaseModule {}
