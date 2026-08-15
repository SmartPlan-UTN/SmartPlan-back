import { INestApplication } from '@nestjs/common';
import { configurarAplicacion } from './configurar-aplicacion';

describe('configurarAplicacion', () => {
  it('configura el prefijo, CORS y la validación global', () => {
    const setGlobalPrefix = jest.fn();
    const enableCors = jest.fn();
    const useGlobalPipes = jest.fn();
    const obtenerConfiguracion = jest
      .fn()
      .mockReturnValue('https://frontend.smartplan.test');
    const app = {
      get: jest.fn().mockReturnValue({ get: obtenerConfiguracion }),
      setGlobalPrefix,
      enableCors,
      useGlobalPipes,
    } as unknown as INestApplication;

    configurarAplicacion(app);

    expect(setGlobalPrefix).toHaveBeenCalledWith('api');
    expect(obtenerConfiguracion).toHaveBeenCalledWith('FRONTEND_URL', {
      infer: true,
    });
    // El array importa: con un string suelto, `cors` emite el encabezado en
    // todas las respuestas sin comparar el `Origin` de la petición y la
    // restricción deja de existir. Si alguien "simplifica" esto a un string,
    // este test tiene que fallar.
    expect(enableCors).toHaveBeenCalledWith({
      origin: ['https://frontend.smartplan.test'],
    });
    expect(useGlobalPipes).toHaveBeenCalledTimes(1);
  });
});
