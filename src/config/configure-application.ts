import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { HttpExceptionFilter } from '../common/errors/http-exception-filter';
import { configureGlobalValidation } from '../common/validation/configure-validation';
import { EnvironmentVariables } from './environment-variables';

export function configureApplication(app: INestApplication): void {
  const configuration = app.get(ConfigService<EnvironmentVariables, true>);

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: [configuration.get('FRONTEND_URL', { infer: true })],
    credentials: true,
  });

  app.use(cookieParser());
  app.useGlobalFilters(new HttpExceptionFilter());
  configureGlobalValidation(app);
}
