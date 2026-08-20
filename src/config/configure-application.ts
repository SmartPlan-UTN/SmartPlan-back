import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpExceptionFilter } from '../common/errors/http-exception-filter';
import { configureGlobalValidation } from '../common/validation/configure-validation';
import { EnvironmentVariables } from './environment-variables';

/**
 * Aplica la configuración HTTP compartida por la aplicación real y los e2e.
 *
 * El origen autorizado por CORS se lee del `ConfigService` en vez de recibirse
 * por parámetro: `FRONTEND_URL` declara su value por defecto una sola vez, en
 * `EnvironmentVariables`, y así ni `main.ts` ni los tests pueden desincronizarse
 * repitiéndolo.
 */
export function configureApplication(app: INestApplication): void {
  const configuration = app.get(ConfigService<EnvironmentVariables, true>);

  app.setGlobalPrefix('api');

  // El origen va en un array y no como string suelto, aunque sea uno solo. No es
  // estilo: con un string, `cors` copia ese value al encabezado
  // `Access-Controle-Allow-Origin` de **todas** las responses sin mirar el
  // `Origin` de la petición. Con un array compara y, si no coincide, omite el
  // encabezado — que es la restricción que queremos.
  app.enableCors({
    origin: [configuration.get('FRONTEND_URL', { infer: true })],
  });

  app.useGlobalFilters(new HttpExceptionFilter());
  configureGlobalValidation(app);
}
