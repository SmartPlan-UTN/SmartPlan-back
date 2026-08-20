import { INestApplication } from '@nestjs/common';
import { configureApplication } from './configure-application';

describe('configureApplication', () => {
  it('configura el prefix, CORS y la validación global', () => {
    const setGlobalPrefix = jest.fn();
    const enableCors = jest.fn();
    const useGlobalFilters = jest.fn();
    const useGlobalPipes = jest.fn();
    const getConfiguration = jest
      .fn()
      .mockReturnValue('https://frontend.smartplan.test');
    const app = {
      get: jest.fn().mockReturnValue({ get: getConfiguration }),
      setGlobalPrefix,
      enableCors,
      useGlobalFilters,
      useGlobalPipes,
    } as unknown as INestApplication;

    configureApplication(app);

    expect(setGlobalPrefix).toHaveBeenCalledWith('api');
    expect(getConfiguration).toHaveBeenCalledWith('FRONTEND_URL', {
      infer: true,
    });
    // El array importa: con un string suelto, `cors` emite el encabezado en
    // todas las responses sin comparar el `Origin` de la petición y la
    // restricción deja de existir. Si alguien "simplifica" esto a un string,
    // este test tiene que fallar.
    expect(enableCors).toHaveBeenCalledWith({
      origin: ['https://frontend.smartplan.test'],
    });
    expect(useGlobalFilters).toHaveBeenCalledTimes(1);
    expect(useGlobalPipes).toHaveBeenCalledTimes(1);
  });
});
