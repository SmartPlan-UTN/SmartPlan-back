import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import {
  EnvironmentVariables,
  Environment,
} from '../config/environment-variables';
import {
  writeRefreshCookie,
  clearRefreshCookie,
  validateCookieOrigin,
} from './auth-http.util';

function configuration(
  entorno: Environment,
): ConfigService<EnvironmentVariables, true> {
  return {
    get: jest.fn((key: keyof EnvironmentVariables) => {
      if (key === 'NODE_ENV') return entorno;
      if (key === 'FRONTEND_URL') return 'https://app.smartplan.test';
      return undefined;
    }),
  } as unknown as ConfigService<EnvironmentVariables, true>;
}

describe('cookies y origen de autenticación', () => {
  it('escribe el refresh con atributos de producción', () => {
    const cookie = jest.fn();
    const response = { cookie } as unknown as Response;

    writeRefreshCookie(
      response,
      'refresh-secreto',
      configuration(Environment.Production),
    );

    expect(cookie).toHaveBeenCalledWith(
      'smartplan_refresh',
      'refresh-secreto',
      {
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
        path: '/api/sessions',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      },
    );
  });

  it('limpia la misma cookie sin conservar el valor', () => {
    const clearCookie = jest.fn();
    const response = { clearCookie } as unknown as Response;

    clearRefreshCookie(response, configuration(Environment.Test));

    expect(clearCookie).toHaveBeenCalledWith('smartplan_refresh', {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/api/sessions',
    });
  });

  it('acepta únicamente el origen configurado cuando está presente', () => {
    const config = configuration(Environment.Production);
    const permitida = {
      headers: { origin: 'https://app.smartplan.test' },
    } as Request;
    const rechazada = {
      headers: { origin: 'https://malicioso.test' },
    } as Request;

    expect(() => validateCookieOrigin(permitida, config)).not.toThrow();
    expect(() => validateCookieOrigin(rechazada, config)).toThrow();
  });
});
