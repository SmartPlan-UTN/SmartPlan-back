import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './messaging/worker/worker.module';

/**
 * Bootstrap del proceso worker. Hermano de `main.ts`, pero sin servidor
 * HTTP: usa `createApplicationContext` en vez de `create`, no llama
 * `configureApplication` (prefix `/api`, CORS, ValidationPipe, filtro HTTP
 * — nada de eso aplica acá) y no abre puerto.
 *
 * El cierre orderado lo hace `enableShutdownHooks()` + el
 * `OnApplicationShutdown` que implementa `RabbitMQModule`: cancela
 * consumidores primero, así que los messages en vuelo terminan de
 * procesarse y no se entrega job nuevo. Verificado contra el código
 * dataSource de `@golevelup/nestjs-rabbitmq`: `AmqpConnection.close()` llama
 * `channel.cancelAll()` y después espera
 * `Promise.all(this.outstandingMessageProcessing)` — el `Set` de promesas
 * en curso que `wrapConsumer()` puebla en cada message entregado — antes de
 * cerrar canales y conexión. No hay handler de señales propio. Nunca llamar
 * `process.exit()` acá — cortaría la conexión sin pasar por ese drenado.
 */
async function bootstrap() {
  // `abortOnError: false`: el default de `createApplicationContext` es
  // `true`, que llama `process.abort()` (SIGABRT, sin log legible) si la
  // inicialización falla — y `connectionInitOptions.reject: true`
  // (messaging.config.ts) hace que eso pase en cualquier arranque donde
  // RabbitMQ todavía no esté listo, el camino esperado en el primer deploy
  // (ver `docs/deployment.md`). Con `false`, el `catch` de abajo loguea el
  // motivo y sale con un código de salida normal.
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    abortOnError: false,
  });
  app.enableShutdownHooks();

  new Logger('Worker').log('Worker de SmartPlan iniciado. Esperando jobs.');
}
void bootstrap().catch((error: unknown) => {
  new Logger('Worker').error(
    'No se pudo inicializar el worker.',
    error instanceof Error ? error.stack : String(error),
  );
  process.exitCode = 1;
});
