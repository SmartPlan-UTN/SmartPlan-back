import { INestApplication } from '@nestjs/common';
import { configurarValidacionGlobal } from '../common/validation/configurar-validacion';

/**
 * Aplica la configuración HTTP compartida por la aplicación real y los e2e.
 */
export function configurarAplicacion(
  app: INestApplication,
  origenFrontend: string,
): void {
  app.setGlobalPrefix('api');
  app.enableCors({ origin: origenFrontend });
  configurarValidacionGlobal(app);
}
