import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { configurarValidacionGlobal } from '../common/validation/configurar-validacion';
import { VariablesEntorno } from './variables-entorno';

/**
 * Aplica la configuración HTTP compartida por la aplicación real y los e2e.
 *
 * El origen autorizado por CORS se lee del `ConfigService` en vez de recibirse
 * por parámetro: `FRONTEND_URL` declara su valor por defecto una sola vez, en
 * `VariablesEntorno`, y así ni `main.ts` ni los tests pueden desincronizarse
 * repitiéndolo.
 */
export function configurarAplicacion(app: INestApplication): void {
  const configuracion = app.get(ConfigService<VariablesEntorno, true>);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: configuracion.get('FRONTEND_URL', { infer: true }),
  });
  configurarValidacionGlobal(app);
}
