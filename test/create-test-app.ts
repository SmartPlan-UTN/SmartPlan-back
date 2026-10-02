import { INestApplication, Type } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/config/configure-application';

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
