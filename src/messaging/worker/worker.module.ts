import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { validateWorkerEnvironment } from '../../config/worker-environment-variables';
import { WorkerDatabaseModule } from '../../database/worker-database.module';
import { ExternalProvider } from '../../external-integration/entities/external-provider.entity';
import { ExternalSync } from '../../external-integration/entities/external-sync.entity';
import { ExternalSyncService } from '../../external-integration/external-sync.service';
import { MessagingModule } from '../messaging.module';
import { JobProcessorService } from './job-processor.service';
import { ExampleHandler } from './handlers/example.handler';
import { ExternalSyncHandler } from './handlers/external-sync.handler';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: '.env',
      validate: validateWorkerEnvironment,
    }),
    WorkerDatabaseModule,
    TypeOrmModule.forFeature([ExternalProvider, ExternalSync]),
    MessagingModule.forRoot('worker'),
  ],
  providers: [
    JobProcessorService,
    ExampleHandler,
    ExternalSyncService,
    ExternalSyncHandler,
  ],
})
export class WorkerModule {}
