import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { HttpExceptionFilter } from '../common/errors/http-exception-filter';
import { HttpRequestLoggingInterceptor } from '../common/logging/http-request-logging.interceptor';
import { requestContextMiddleware } from '../common/logging/request-context.middleware';
import { configureGlobalValidation } from '../common/validation/configure-validation';
import { EnvironmentVariables } from './environment-variables';

export function configureApplication(app: INestApplication): void {
  const configuration = app.get(ConfigService<EnvironmentVariables, true>);

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: [configuration.get('FRONTEND_URL', { infer: true })],
    credentials: true,
    exposedHeaders: ['X-Request-Id'],
  });

  app.use(cookieParser());
  app.use(requestContextMiddleware);
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new HttpRequestLoggingInterceptor());
  configureGlobalValidation(app);
}
