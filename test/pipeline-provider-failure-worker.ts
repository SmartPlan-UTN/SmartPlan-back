import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PermanentJobError } from '../src/messaging/errors/permanent-job-error';
import { GeminiClientService } from '../src/recommendation/gemini/gemini-client.service';
import { WorkerModule } from '../src/messaging/worker/worker.module';

const providerDenied = (): never => {
  throw new PermanentJobError(
    JSON.stringify({
      code: 'GENERATION_PROVIDER_UNAVAILABLE',
      provider: 'gemini',
    }),
  );
};

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    abortOnError: false,
  });
  const gemini = app.get(GeminiClientService);
  gemini.interpretIntent = providerDenied;
  gemini.composePlans = providerDenied;
  app.enableShutdownHooks();
  new Logger('PipelineProviderFailureWorker').log(
    'Pipeline provider-failure worker ready',
  );
}

void bootstrap().catch((error: unknown) => {
  new Logger('PipelineProviderFailureWorker').error(
    'The worker could not be initialized.',
    error instanceof Error ? error.stack : String(error),
  );
  process.exitCode = 1;
});
