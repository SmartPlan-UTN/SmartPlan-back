import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateWorkerEnvironment } from '../../config/worker-environment-variables';
import { MessagingModule } from '../messaging.module';
import { JobProcessorService } from './job-processor.service';
import { ExampleHandler } from './handlers/example.handler';

/**
 * Módulo raíz del proceso worker (src/worker.ts).
 *
 * Registra su propio `ConfigModule.forRoot` con `validateWorkerEnvironment`, un
 * esquema separado del que usa `AppModule` (`validateEnvironment`) — no es un
 * error a corregir: `main.ts` y `worker.ts` son dos procesos Node distintos,
 * cada uno crea su propia instancia de aplicación Nest, nunca comparten
 * container de DI. `isGlobal: true` en los dos no colisiona por la misma
 * razón. No "simplificar" haciendo que este módulo importe `AppModule`: eso
 * arrastraría `DatabaseModule`, `AppController` y todo lo que venga después.
 *
 * No importa `DatabaseModule` en este ticket — deliberado, sin status
 * persistido de jobs todavía.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: '.env',
      validate: validateWorkerEnvironment,
    }),
    // 'worker': topología completa — este proceso consume la queue
    // principal y republica a retry/DLQ. Ver MessagingRole en
    // messaging.config.ts.
    MessagingModule.forRoot('worker'),
  ],
  providers: [JobProcessorService, ExampleHandler],
})
export class WorkerModule {}
