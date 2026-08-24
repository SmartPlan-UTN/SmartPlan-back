import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { validateWorkerEnvironment } from '../../config/worker-environment-variables';
import { DatabaseModule } from '../../database/database.module';
import { Category } from '../../categories/entities/category.entity';
import { Notification } from '../../administration/entities/notification.entity';
import { Department } from '../../places/entities/department.entity';
import { Plan } from '../../plans/entities/plan.entity';
import { PlanRequest } from '../../recommendation/entities/plan-request.entity';
import { PlanRequestCategory } from '../../recommendation/entities/plan-request-category.entity';
import { UserPreference } from '../../users/entities/user-preference.entity';
import { GoogleMapsClientService } from '../../external-integration/google-maps/google-maps-client.service';
import { GeminiClientService } from '../../recommendation/gemini/gemini-client.service';
import { PlanGenerationService } from '../../recommendation/plan-generation.service';
import { MessagingModule } from '../messaging.module';
import { FeedbackNotificationScheduler } from './feedback-notification.scheduler';
import { JobProcessorService } from './job-processor.service';
import { PlanRequestRecoveryScheduler } from './plan-request-recovery.scheduler';
import { ExampleHandler } from './handlers/example.handler';
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
    DatabaseModule,
    TypeOrmModule.forFeature([
      Category,
      Department,
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
    FeedbackNotificationScheduler,
    PlanRequestRecoveryScheduler,
    GeminiClientService,
    GoogleMapsClientService,
    PlanGenerationService,
    GeneratePlanRequestHandler,
  ],
})
export class WorkerModule {}
