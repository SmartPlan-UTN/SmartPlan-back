import { INestApplication, Type } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/config/configure-application';

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
 * service que sale a internet:
 *
 * ```ts
 * const app = await createTestApp((module) =>
 *   module.overrideProvider(GoogleMapsService).useValue(mapaFalso),
 * );
 * ```
 */
export async function createTestApp(
  customize?: (module: TestingModuleBuilder) => TestingModuleBuilder,
  controllers: Type<unknown>[] = [],
): Promise<INestApplication<App>> {
  let module = Test.createTestingModule({
    imports: [AppModule],
    controllers,
  });

  if (customize) {
    module = customize(module);
  }

  const app = (await module.compile()).createNestApplication<
    INestApplication<App>
  >();

  configureApplication(app);
  await app.init();

  return app;
}
