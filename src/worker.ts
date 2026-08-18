import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './mensajeria/worker/worker.module';

/**
 * Bootstrap del proceso worker. Hermano de `main.ts`, pero sin servidor
 * HTTP: usa `createApplicationContext` en vez de `create`, no llama
 * `configurarAplicacion` (prefijo `/api`, CORS, ValidationPipe, filtro HTTP
 * — nada de eso aplica acá) y no abre puerto.
 *
 * El cierre ordenado lo hace `enableShutdownHooks()` + el
 * `OnApplicationShutdown` que implementa `RabbitMQModule`: cancela
 * consumidores primero, así que los mensajes en vuelo terminan de
 * procesarse y no se entrega trabajo nuevo. No hay handler de señales
 * propio. Nunca llamar `process.exit()` acá — cortaría mensajes en vuelo.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();

  new Logger('Worker').log('Worker de SmartPlan iniciado. Esperando trabajos.');
}
void bootstrap();
