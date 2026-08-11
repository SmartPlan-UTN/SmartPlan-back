import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { VariablesEntorno } from './config/variables-entorno';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configuracion = app.get(ConfigService<VariablesEntorno, true>);
  await app.listen(configuracion.get('PORT', { infer: true }));
}
void bootstrap();
