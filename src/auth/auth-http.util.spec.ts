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
  environment: Environment,
): ConfigService<EnvironmentVariables, true> {
  return {
    get: jest.fn((key: keyof EnvironmentVariables) => {
      if (key === 'NODE_ENV') return environment;
      if (key === 'FRONTEND_URL') return 'https://app.smartplan.test';
      return undefined;
    }),
  } as unknown as ConfigService<EnvironmentVariables, true>;
}

describe('cookies and origin of authentication', () => {
  it('writes the refresh cookie with production attributes', () => {
    const cookie = jest.fn();
    const response = { cookie } as unknown as Response;

    writeRefreshCookie(
      response,
      'refresh-secret',
      configuration(Environment.Production),
    );

    expect(cookie).toHaveBeenCalledWith('smartplan_refresh', 'refresh-secret', {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/api/sessions',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  });

  it('clears the same cookie without retaining its value', () => {
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

  it('accepts only the configured origin when present', () => {
    const config = configuration(Environment.Production);
    const allowedRequest = {
      headers: { origin: 'https://app.smartplan.test' },
    } as Request;
    const rejectedRequest = {
      headers: { origin: 'https://malicious.test' },
    } as Request;

    expect(() => validateCookieOrigin(allowedRequest, config)).not.toThrow();
    expect(() => validateCookieOrigin(rejectedRequest, config)).toThrow();
  });
});
