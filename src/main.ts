import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { swaggerExtraModels } from './common/swagger/api-controller.decorator';
import { configureApplication } from './config/configure-application';
import { EnvironmentVariables } from './config/environment-variables';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configuration = app.get(ConfigService<EnvironmentVariables, true>);

  configureApplication(app);
  // Lets the worker thread (WORKER_THREAD_ENABLED) stop cleanly on SIGTERM.
  app.enableShutdownHooks();

  const swaggerConfiguration = new DocumentBuilder()
    .setTitle('SmartPlan API')
    .setDescription(
      'REST API for personalized recreational plans. All routes are prefixed with /api.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .build();
  const swaggerDocument = SwaggerModule.createDocument(
    app,
    swaggerConfiguration,
    {
      extraModels: swaggerExtraModels,
    },
  );
  SwaggerModule.setup('docs', app, swaggerDocument, {
    useGlobalPrefix: true,
    jsonDocumentUrl: 'docs-json',
  });

  await app.listen(configuration.get('PORT', { infer: true }));
}
void bootstrap().catch((error: unknown) => {
  new Logger('Bootstrap').error(
    'The API could not be initialized.',
    error instanceof Error ? error.stack : String(error),
  );
  process.exitCode = 1;
});
