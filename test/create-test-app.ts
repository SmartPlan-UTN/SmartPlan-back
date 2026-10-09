import { INestApplication, Type } from '@nestjs/common';
import {
  AmqpConnection,
  AmqpConnectionManager,
} from '@golevelup/nestjs-rabbitmq';
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

/** Use for API e2e suites that do not exercise message publishing. */
export async function createTestAppWithoutRabbit(): Promise<
  INestApplication<App>
> {
  const connection = { publish: jest.fn() };
  return createTestApp((module) =>
    module
      .overrideProvider(AmqpConnectionManager)
      .useValue({
        addConnection: jest.fn(),
        getConnection: jest.fn().mockReturnValue(connection),
        getConnections: jest.fn().mockReturnValue([]),
        clearConnections: jest.fn(),
        close: jest.fn().mockResolvedValue(undefined),
      })
      .overrideProvider(AmqpConnection)
      .useValue(connection),
  );
}
