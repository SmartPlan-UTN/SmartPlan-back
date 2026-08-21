import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateWorkerEnvironment } from '../../config/worker-environment-variables';
import { MessagingModule } from '../messaging.module';
import { JobProcessorService } from './job-processor.service';
import { ExampleHandler } from './handlers/example.handler';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: '.env',
      validate: validateWorkerEnvironment,
    }),
    MessagingModule.forRoot('worker'),
  ],
  providers: [JobProcessorService, ExampleHandler],
})
export class WorkerModule {}
