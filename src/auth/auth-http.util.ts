import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CookieOptions, Request, Response } from 'express';
import { allowedOrigins } from '../config/allowed-origins';
import {
  EnvironmentVariables,
  Environment,
} from '../config/environment-variables';
import { REFRESH_COOKIE, REFRESH_DURATION_SECONDS } from './auth.constants';

function cookieOptions(
  configuration: ConfigService<EnvironmentVariables, true>,
): CookieOptions {
  const secure =
    configuration.get('NODE_ENV', { infer: true }) === Environment.Production;

  return {
    httpOnly: true,
    // The deployed frontend and the API live on different sites, and a
    // browser never attaches a `lax` cookie to a cross-site request, so
    // `POST /sessions/refresh` arrived without it and every reload landed on
    // the login screen. `none` is what cross-site needs, but it is only
    // valid together with `secure`, so the two are tied: `lax` stays for
    // plain-http local development, where both ends are `localhost` and
    // therefore the same site.
    sameSite: secure ? 'none' : 'lax',
    secure,
    path: '/api/sessions',
    maxAge: REFRESH_DURATION_SECONDS * 1000,
  };
}

export function writeRefreshCookie(
  response: Response,
  token: string,
  configuration: ConfigService<EnvironmentVariables, true>,
): void {
  response.cookie(REFRESH_COOKIE, token, cookieOptions(configuration));
}

export function clearRefreshCookie(
  response: Response,
  configuration: ConfigService<EnvironmentVariables, true>,
): void {
  const options = cookieOptions(configuration);
  response.clearCookie(REFRESH_COOKIE, {
    httpOnly: options.httpOnly,
    sameSite: options.sameSite,
    secure: options.secure,
    path: options.path,
  });
}

export function validateCookieOrigin(
  request: Request,
  configuration: ConfigService<EnvironmentVariables, true>,
): void {
  const origin = request.headers.origin;
  if (origin && !allowedOrigins(configuration).includes(origin)) {
    throw new ForbiddenException({
      code: 'ORIGIN_NOT_ALLOWED',
      message: 'The request origin is not allowed',
    });
  }
}
