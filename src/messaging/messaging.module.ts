import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { CommonEnvironmentVariables } from '../config/environment-variables';
import { buildMessagingOptions, MessagingRole } from './messaging.config';
import { MessagingService } from './messaging.service';

/**
 * Registra la conexión a RabbitMQ y expone `MessagingService`.
 *
 * Se registra con `forRootAsync` para que la configuración se resuelva recién
 * cuando `ConfigModule` terminó de leer y validar el environment — mismo patrón
 * que `src/database/database.module.ts` con `TypeOrmModule.forRootAsync`.
 *
 * `forRoot(role)` decide qué topología declarar: `AppModule` pasa
 * `'producer'` (la API solo publica al exchange principal) y
 * `WorkerModule` pasa `'worker'` (topología completa, incluidas las queues
 * de retry/DLQ que consume `JobProcessorService`). Antes los dos
 * procesos declaraban siempre la topología completa — ver el porqué del
 * cambio en el docstring de `MessagingRole` (`messaging.config.ts`).
 */
@Module({})
export class MessagingModule {
  static forRoot(role: MessagingRole): DynamicModule {
    return {
      module: MessagingModule,
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
