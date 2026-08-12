import { INestApplication } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configurarAplicacion } from '../src/config/configurar-aplicacion';

/**
 * Levanta la aplicación completa para un test e2e.
 *
 * Centralizar el arranque acá tiene un motivo concreto: la app de los tests
 * tiene que configurarse **igual** que la de producción. La configuración
 * compartida se aplica antes de inicializarla para que los e2e no prueben una
 * app distinta de la que se despliega.
 *
 * El parámetro `personalizar` es el punto de extensión para cuando un test
 * necesite reemplazar una dependencia real por una falsa — típicamente un
 * servicio que sale a internet:
 *
 * ```ts
 * const app = await crearAppDePrueba((modulo) =>
 *   modulo.overrideProvider(ServicioDeGoogleMaps).useValue(mapaFalso),
 * );
 * ```
 */
export async function crearAppDePrueba(
  personalizar?: (modulo: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<INestApplication<App>> {
  let modulo = Test.createTestingModule({ imports: [AppModule] });

  if (personalizar) {
    modulo = personalizar(modulo);
  }

  const app = (await modulo.compile()).createNestApplication<
    INestApplication<App>
  >();

  configurarAplicacion(app, 'http://localhost:3000');
  await app.init();

  return app;
}
