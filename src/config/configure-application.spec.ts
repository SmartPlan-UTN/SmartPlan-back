import { INestApplication } from '@nestjs/common';
import { configureApplication } from './configure-application';

describe('configureApplication', () => {
  it('configura the prefix, CORS and the validation global', () => {
    const setGlobalPrefix = jest.fn();
    const enableCors = jest.fn();
    const useGlobalFilters = jest.fn();
    const useGlobalInterceptors = jest.fn();
    const useGlobalPipes = jest.fn();
    const use = jest.fn();
    const getConfiguration = jest.fn((key: string) =>
      key === 'CORS_ORIGINS'
        ? ['https://staging.smartplan.test', 'https://smartplan.test']
        : 'https://frontend.smartplan.test',
    );
    const app = {
      get: jest.fn().mockReturnValue({ get: getConfiguration }),
      setGlobalPrefix,
      enableCors,
      use,
      useGlobalFilters,
      useGlobalInterceptors,
      useGlobalPipes,
    } as unknown as INestApplication;

    configureApplication(app);

    expect(setGlobalPrefix).toHaveBeenCalledWith('api');
    expect(getConfiguration).toHaveBeenCalledWith('CORS_ORIGINS', {
      infer: true,
    });
    expect(enableCors).toHaveBeenCalledWith({
      origin: ['https://staging.smartplan.test', 'https://smartplan.test'],
      credentials: true,
      exposedHeaders: ['X-Request-Id'],
    });
    expect(use).toHaveBeenCalledTimes(2);
    expect(useGlobalFilters).toHaveBeenCalledTimes(1);
    expect(useGlobalInterceptors).toHaveBeenCalledTimes(1);
    expect(useGlobalPipes).toHaveBeenCalledTimes(1);
  });

  it('falls back to the canonical frontend origin when CORS_ORIGINS is absent', () => {
    const enableCors = jest.fn();
    const app = {
      get: jest.fn().mockReturnValue({
        get: jest.fn((key: string) =>
          key === 'CORS_ORIGINS'
            ? undefined
            : 'https://frontend.smartplan.test',
        ),
      }),
      setGlobalPrefix: jest.fn(),
      enableCors,
      use: jest.fn(),
      useGlobalFilters: jest.fn(),
      useGlobalInterceptors: jest.fn(),
      useGlobalPipes: jest.fn(),
    } as unknown as INestApplication;

    configureApplication(app);

    expect(enableCors).toHaveBeenCalledWith(
      expect.objectContaining({ origin: ['https://frontend.smartplan.test'] }),
    );
  });
});
