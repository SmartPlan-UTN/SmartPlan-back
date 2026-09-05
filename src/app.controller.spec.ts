import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let controller: AppController;
  let service: jest.Mocked<Pick<AppService, 'getHello'>>;

  beforeEach(async () => {
    service = { getHello: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: AppService, useValue: service }],
    }).compile();

    controller = module.get(AppController);
  });

  describe('getHello', () => {
    it('returns the value provided by the service', () => {
      service.getHello.mockReturnValue('Hola SmartPlan');

      expect(controller.getHello()).toBe('Hola SmartPlan');
    });

    it('delegates in the service a once time', () => {
      controller.getHello();

      expect(service.getHello).toHaveBeenCalledTimes(1);
    });
  });
});
