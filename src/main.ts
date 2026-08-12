import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configurarAplicacion } from './config/configurar-aplicacion';
import { VariablesEntorno } from './config/variables-entorno';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configuracion = app.get(ConfigService<VariablesEntorno, true>);

  const origenFrontend =
    configuracion.get('FRONTEND_URL', { infer: true }) ??
    'http://localhost:3000';
  const puerto = Number(configuracion.get('PORT', { infer: true }) ?? 3001);

  configurarAplicacion(app, origenFrontend);
  await app.listen(puerto);
}
void bootstrap();
