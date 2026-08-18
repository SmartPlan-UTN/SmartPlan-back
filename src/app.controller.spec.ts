import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

/**
 * MOLDE de test unitario de un controller, con el servicio mockeado.
 *
 * Un controller no tiene lógica propia: valida la entrada, delega en un servicio
 * y arma la respuesta. Eso es lo único que hay que probar acá — que **delega en
 * quien corresponde**. Que el servicio calcule bien es asunto de
 * `app.service.spec.ts`, y que la ruta responda por HTTP es asunto de
 * `test/app.e2e-spec.ts`.
 *
 * El doble se registra con `{ provide, useValue }`: el contenedor de Nest inyecta
 * el objeto falso en lugar del real. Es el mismo mecanismo para un `Repository`,
 * un `ConfigService` o un cliente de Google Maps.
 */
describe('AppController', () => {
  let controller: AppController;
  let servicio: jest.Mocked<Pick<AppService, 'getHello'>>;

  beforeEach(async () => {
    // Tipar el doble como `Pick<AppService, ...>` en vez de `any` hace que el
    // test deje de compilar si el método cambia de firma. Un mock sin tipar es
    // un test que puede quedar probando algo que ya no existe.
    servicio = { getHello: jest.fn() };

    const modulo: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: AppService, useValue: servicio }],
    }).compile();

    controller = modulo.get(AppController);
  });

  describe('getHello', () => {
    it('devuelve lo que le da el servicio', () => {
      servicio.getHello.mockReturnValue('Hola SmartPlan');

      expect(controller.getHello()).toBe('Hola SmartPlan');
    });

    it('delega en el servicio una sola vez', () => {
      controller.getHello();

      expect(servicio.getHello).toHaveBeenCalledTimes(1);
    });
  });
});
