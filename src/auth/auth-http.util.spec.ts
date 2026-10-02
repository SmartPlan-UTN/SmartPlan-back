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
  corsOrigins?: string[],
): ConfigService<EnvironmentVariables, true> {
  return {
    get: jest.fn((key: keyof EnvironmentVariables) => {
      if (key === 'NODE_ENV') return environment;
      if (key === 'FRONTEND_URL') return 'https://app.smartplan.test';
      if (key === 'CORS_ORIGINS') return corsOrigins;
      return undefined;
    }),
  } as unknown as ConfigService<EnvironmentVariables, true>;
}

describe('cookies and origin of authentication', () => {
  it('writes a cross-site capable cookie in production', () => {
    const cookie = jest.fn();
    const response = { cookie } as unknown as Response;

    writeRefreshCookie(
      response,
      'refresh-secret',
      configuration(Environment.Production),
    );

    // `none` is what lets the browser send the cookie to an API on another
    // site than the frontend; it is only valid alongside `secure`.
    expect(cookie).toHaveBeenCalledWith('smartplan_refresh', 'refresh-secret', {
      httpOnly: true,
      sameSite: 'none',
      secure: true,
      path: '/api/sessions',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  });

  it('keeps a lax cookie outside production, where plain http rules out secure', () => {
    const cookie = jest.fn();
    const response = { cookie } as unknown as Response;

    writeRefreshCookie(
      response,
      'refresh-secret',
      configuration(Environment.Development),
    );

    expect(cookie).toHaveBeenCalledWith(
      'smartplan_refresh',
      'refresh-secret',
      expect.objectContaining({ sameSite: 'lax', secure: false }),
    );
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

  it('clears with the same attributes it wrote, or the browser keeps the cookie', () => {
    const clearCookie = jest.fn();
    const response = { clearCookie } as unknown as Response;

    clearRefreshCookie(response, configuration(Environment.Production));

    expect(clearCookie).toHaveBeenCalledWith(
      'smartplan_refresh',
      expect.objectContaining({ sameSite: 'none', secure: true }),
    );
  });

  it('accepts only the canonical frontend when no allow-list is configured', () => {
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

  it('accepts every origin in CORS_ORIGINS, the same list CORS honours', () => {
    const config = configuration(Environment.Production, [
      'https://smartplan.vercel.app',
      'https://smartplan-git-develop.vercel.app',
    ]);

    for (const origin of [
      'https://smartplan.vercel.app',
      'https://smartplan-git-develop.vercel.app',
    ]) {
      expect(() =>
        validateCookieOrigin({ headers: { origin } } as Request, config),
      ).not.toThrow();
    }

    // With an explicit allow-list, FRONTEND_URL is no longer implied.
    expect(() =>
      validateCookieOrigin(
        { headers: { origin: 'https://app.smartplan.test' } } as Request,
        config,
      ),
    ).toThrow();
  });

  it('lets a request without an Origin header through', () => {
    expect(() =>
      validateCookieOrigin(
        { headers: {} } as Request,
        configuration(Environment.Production),
      ),
    ).not.toThrow();
  });
});
