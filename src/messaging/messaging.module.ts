import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { CommonEnvironmentVariables } from '../config/environment-variables';
import { buildMessagingOptions, MessagingRole } from './messaging.config';
import { MessagingService } from './messaging.service';

@Module({})
export class MessagingModule {
  static forRoot(role: MessagingRole): DynamicModule {
    return {
      module: MessagingModule,
      global: true,
      imports: [
        RabbitMQModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (
            config: ConfigService<CommonEnvironmentVariables, true>,
          ) => buildMessagingOptions(config, role),
        }),
      ],
      providers: [MessagingService],
      exports: [MessagingService, RabbitMQModule],
    };
  }
}
