import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configurarAplicacion } from './config/configurar-aplicacion';
import { VariablesEntorno } from './config/variables-entorno';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configuracion = app.get(ConfigService<VariablesEntorno, true>);

  configurarAplicacion(app);

  // Sin valor por defecto acá a propósito: `validarEntorno` corre al arrancar y
  // ya aplicó el del esquema, así que el puerto siempre viene definido.
  // Repetirlo sería una segunda verdad que se puede desincronizar.
  await app.listen(configuracion.get('PORT', { infer: true }));
}
void bootstrap();
