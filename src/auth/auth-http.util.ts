import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CookieOptions, Request, Response } from 'express';
import {
  EnvironmentVariables,
  Environment,
} from '../config/environment-variables';
import { REFRESH_COOKIE, REFRESH_DURATION_SECONDS } from './auth.constants';

function opcionesCookie(
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
  response.cookie(REFRESH_COOKIE, token, opcionesCookie(configuration));
}

export function clearRefreshCookie(
  response: Response,
  configuration: ConfigService<EnvironmentVariables, true>,
): void {
  const opciones = opcionesCookie(configuration);
  response.clearCookie(REFRESH_COOKIE, {
    httpOnly: opciones.httpOnly,
    sameSite: opciones.sameSite,
    secure: opciones.secure,
    path: opciones.path,
  });
}

export function validateCookieOrigin(
  request: Request,
  configuration: ConfigService<EnvironmentVariables, true>,
): void {
  const origen = request.headers.origin;
  if (origen && origen !== configuration.get('FRONTEND_URL', { infer: true })) {
    throw new ForbiddenException({
      code: 'ORIGEN_NO_PERMITIDO',
      message: 'El origen de la request no está permitido',
    });
  }
}
