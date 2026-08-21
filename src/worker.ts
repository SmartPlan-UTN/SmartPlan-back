import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './messaging/worker/worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    abortOnError: false,
  });
  app.enableShutdownHooks();

  new Logger('Worker').log('Worker of SmartPlan iniciado. Esperando jobs.');
}
void bootstrap().catch((error: unknown) => {
  new Logger('Worker').error(
    'The worker could not be initialized.',
    error instanceof Error ? error.stack : String(error),
  );
  process.exitCode = 1;
});
