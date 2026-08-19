import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CookieOptions, Request, Response } from 'express';
import { VariablesEntorno, Entorno } from '../config/variables-entorno';
import { COOKIE_REFRESH, DURACION_REFRESH_SEGUNDOS } from './auth.constants';

function opcionesCookie(
  configuracion: ConfigService<VariablesEntorno, true>,
): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure:
      configuracion.get('NODE_ENV', { infer: true }) === Entorno.Produccion,
    path: '/api/sesiones',
    maxAge: DURACION_REFRESH_SEGUNDOS * 1000,
  };
}

export function escribirCookieRefresh(
  respuesta: Response,
  token: string,
  configuracion: ConfigService<VariablesEntorno, true>,
): void {
  respuesta.cookie(COOKIE_REFRESH, token, opcionesCookie(configuracion));
}

export function limpiarCookieRefresh(
  respuesta: Response,
  configuracion: ConfigService<VariablesEntorno, true>,
): void {
  const opciones = opcionesCookie(configuracion);
  respuesta.clearCookie(COOKIE_REFRESH, {
    httpOnly: opciones.httpOnly,
    sameSite: opciones.sameSite,
    secure: opciones.secure,
    path: opciones.path,
  });
}

export function validarOrigenCookie(
  solicitud: Request,
  configuracion: ConfigService<VariablesEntorno, true>,
): void {
  const origen = solicitud.headers.origin;
  if (origen && origen !== configuracion.get('FRONTEND_URL', { infer: true })) {
    throw new ForbiddenException({
      codigo: 'ORIGEN_NO_PERMITIDO',
      mensaje: 'El origen de la solicitud no está permitido',
    });
  }
}
