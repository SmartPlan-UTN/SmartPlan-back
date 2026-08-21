import { INestApplication } from '@nestjs/common';
import { configureApplication } from './configure-application';

describe('configureApplication', () => {
  it('configura the prefix, CORS and the validation global', () => {
    const setGlobalPrefix = jest.fn();
    const enableCors = jest.fn();
    const useGlobalFilters = jest.fn();
    const useGlobalPipes = jest.fn();
    const use = jest.fn();
    const getConfiguration = jest
      .fn()
      .mockReturnValue('https://frontend.smartplan.test');
    const app = {
      get: jest.fn().mockReturnValue({ get: getConfiguration }),
      setGlobalPrefix,
      enableCors,
      use,
      useGlobalFilters,
      useGlobalPipes,
    } as unknown as INestApplication;

    configureApplication(app);

    expect(setGlobalPrefix).toHaveBeenCalledWith('api');
    expect(getConfiguration).toHaveBeenCalledWith('FRONTEND_URL', {
      infer: true,
    });
    expect(enableCors).toHaveBeenCalledWith({
      origin: ['https://frontend.smartplan.test'],
      credentials: true,
    });
    expect(use).toHaveBeenCalledTimes(1);
    expect(useGlobalFilters).toHaveBeenCalledTimes(1);
    expect(useGlobalPipes).toHaveBeenCalledTimes(1);
  });
});
