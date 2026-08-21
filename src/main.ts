import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApplication } from './config/configure-application';
import { EnvironmentVariables } from './config/environment-variables';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configuration = app.get(ConfigService<EnvironmentVariables, true>);

  configureApplication(app);

  await app.listen(configuration.get('PORT', { infer: true }));
}
void bootstrap();
