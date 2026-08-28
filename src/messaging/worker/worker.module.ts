import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityPlace } from '../../activities/entities/activity-place.entity';
import { Notification } from '../../administration/entities/notification.entity';
import { Category } from '../../categories/entities/category.entity';
import { validateWorkerEnvironment } from '../../config/worker-environment-variables';
import { WorkerDatabaseModule } from '../../database/worker-database.module';
import { ExternalDataUsage } from '../../external-integration/entities/external-data-usage.entity';
import { ExternalProvider } from '../../external-integration/entities/external-provider.entity';
import { ExternalSync } from '../../external-integration/entities/external-sync.entity';
import { ExternalDataUsageService } from '../../external-integration/external-data-usage.service';
import { ExternalSyncService } from '../../external-integration/external-sync.service';
import { GoogleMapsClientService } from '../../external-integration/google-maps/google-maps-client.service';
import { Department } from '../../places/entities/department.entity';
import { Plan } from '../../plans/entities/plan.entity';
import { GeminiClientService } from '../../recommendation/gemini/gemini-client.service';
import { PlanGenerationService } from '../../recommendation/plan-generation.service';
import { PlanRequest } from '../../recommendation/entities/plan-request.entity';
import { PlanRequestCategory } from '../../recommendation/entities/plan-request-category.entity';
import { UserPreference } from '../../users/entities/user-preference.entity';
import { MessagingModule } from '../messaging.module';
import { FeedbackNotificationScheduler } from './feedback-notification.scheduler';
import { JobProcessorService } from './job-processor.service';
import { PlanRequestRecoveryScheduler } from './plan-request-recovery.scheduler';
import { ExampleHandler } from './handlers/example.handler';
import { ExternalSyncHandler } from './handlers/external-sync.handler';
import { GeneratePlanRequestHandler } from './handlers/generate-plan-request.handler';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: '.env',
      validate: validateWorkerEnvironment,
    }),
    ScheduleModule.forRoot(),
    WorkerDatabaseModule,
    TypeOrmModule.forFeature([
      ActivityPlace,
      Category,
      Department,
      ExternalDataUsage,
      ExternalProvider,
      ExternalSync,
      Notification,
      Plan,
      PlanRequest,
      PlanRequestCategory,
      UserPreference,
    ]),
    MessagingModule.forRoot('worker'),
  ],
  providers: [
    JobProcessorService,
    ExampleHandler,
    ExternalDataUsageService,
    ExternalSyncService,
    ExternalSyncHandler,
    FeedbackNotificationScheduler,
    PlanRequestRecoveryScheduler,
    GeminiClientService,
    GoogleMapsClientService,
    PlanGenerationService,
    GeneratePlanRequestHandler,
  ],
})
export class WorkerModule {}
