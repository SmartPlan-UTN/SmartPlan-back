import { INestApplication } from '@nestjs/common';
import { configurarAplicacion } from './configurar-aplicacion';

describe('configurarAplicacion', () => {
  it('configura el prefijo, CORS y la validación global', () => {
    const setGlobalPrefix = jest.fn();
    const enableCors = jest.fn();
    const useGlobalPipes = jest.fn();
    const app = {
      setGlobalPrefix,
      enableCors,
      useGlobalPipes,
    } as unknown as INestApplication;

    configurarAplicacion(app, 'https://frontend.smartplan.test');

    expect(setGlobalPrefix).toHaveBeenCalledWith('api');
    expect(enableCors).toHaveBeenCalledWith({
      origin: 'https://frontend.smartplan.test',
    });
    expect(useGlobalPipes).toHaveBeenCalledTimes(1);
  });
});
