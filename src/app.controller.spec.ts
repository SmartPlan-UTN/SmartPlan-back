import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

/**
 * MOLDE de test unitario de un controller, con el service mockeado.
 *
 * Un controller no tiene lógica propia: valida la input, delega en un service
 * y arma la response. Eso es lo único que hay que probar acá — que **delega en
 * quien corresponde**. Que el service calcule bien es asunto de
 * `app.service.spec.ts`, y que la route responda por HTTP es asunto de
 * `test/app.e2e-spec.ts`.
 *
 * El doble se registra con `{ provide, useValue }`: el container de Nest inyecta
 * el objeto falso en place del real. Es el mismo mecanismo para un `Repository`,
 * un `ConfigService` o un client de Google Maps.
 */
describe('AppController', () => {
  let controller: AppController;
  let service: jest.Mocked<Pick<AppService, 'getHello'>>;

  beforeEach(async () => {
    // Tipar el doble como `Pick<AppService, ...>` en vez de `any` hace que el
    // test deje de compilar si el método cambia de firma. Un mock sin tipar es
    // un test que puede quedar probando algo que ya no existe.
    service = { getHello: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: AppService, useValue: service }],
    }).compile();

    controller = module.get(AppController);
  });

  describe('getHello', () => {
    it('devuelve lo que le da el service', () => {
      service.getHello.mockReturnValue('Hola SmartPlan');

      expect(controller.getHello()).toBe('Hola SmartPlan');
    });

    it('delega en el service una sola vez', () => {
      controller.getHello();

      expect(service.getHello).toHaveBeenCalledTimes(1);
    });
  });
});
