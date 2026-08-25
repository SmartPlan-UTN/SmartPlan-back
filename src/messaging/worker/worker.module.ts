import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityPlace } from '../../activities/entities/activity-place.entity';
import { validateWorkerEnvironment } from '../../config/worker-environment-variables';
import { WorkerDatabaseModule } from '../../database/worker-database.module';
import { ExternalDataUsage } from '../../external-integration/entities/external-data-usage.entity';
import { ExternalProvider } from '../../external-integration/entities/external-provider.entity';
import { ExternalSync } from '../../external-integration/entities/external-sync.entity';
import { ExternalDataUsageService } from '../../external-integration/external-data-usage.service';
import { ExternalSyncService } from '../../external-integration/external-sync.service';
import { GoogleMapsClientService } from '../../external-integration/google-maps/google-maps-client.service';
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
    TypeOrmModule.forFeature([
      ExternalProvider,
      ExternalSync,
      ExternalDataUsage,
      ActivityPlace,
    ]),
    MessagingModule.forRoot('worker'),
  ],
  providers: [
    JobProcessorService,
    ExampleHandler,
    GoogleMapsClientService,
    ExternalDataUsageService,
    ExternalSyncService,
    ExternalSyncHandler,
  ],
})
export class WorkerModule {}
