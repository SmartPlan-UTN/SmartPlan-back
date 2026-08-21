import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CookieOptions, Request, Response } from 'express';
import {
  EnvironmentVariables,
  Environment,
} from '../config/environment-variables';
import { REFRESH_COOKIE, REFRESH_DURATION_SECONDS } from './auth.constants';

function cookieOptions(
  configuration: ConfigService<EnvironmentVariables, true>,
): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure:
      configuration.get('NODE_ENV', { infer: true }) === Environment.Production,
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
  if (origin && origin !== configuration.get('FRONTEND_URL', { infer: true })) {
    throw new ForbiddenException({
      code: 'ORIGIN_NOT_ALLOWED',
      message: 'The request origin is not allowed',
    });
  }
}
