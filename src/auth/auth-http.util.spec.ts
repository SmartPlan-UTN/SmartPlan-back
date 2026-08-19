import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { VariablesEntorno, Entorno } from '../config/variables-entorno';
import {
  escribirCookieRefresh,
  limpiarCookieRefresh,
  validarOrigenCookie,
} from './auth-http.util';

function configuracion(
  entorno: Entorno,
): ConfigService<VariablesEntorno, true> {
  return {
    get: jest.fn((clave: keyof VariablesEntorno) => {
      if (clave === 'NODE_ENV') return entorno;
      if (clave === 'FRONTEND_URL') return 'https://app.smartplan.test';
      return undefined;
    }),
  } as unknown as ConfigService<VariablesEntorno, true>;
}

describe('cookies y origen de autenticación', () => {
  it('escribe el refresh con atributos de producción', () => {
    const cookie = jest.fn();
    const respuesta = { cookie } as unknown as Response;

    escribirCookieRefresh(
      respuesta,
      'refresh-secreto',
      configuracion(Entorno.Produccion),
    );

    expect(cookie).toHaveBeenCalledWith(
      'smartplan_refresh',
      'refresh-secreto',
      {
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
        path: '/api/sesiones',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      },
    );
  });

  it('limpia la misma cookie sin conservar el valor', () => {
    const clearCookie = jest.fn();
    const respuesta = { clearCookie } as unknown as Response;

    limpiarCookieRefresh(respuesta, configuracion(Entorno.Prueba));

    expect(clearCookie).toHaveBeenCalledWith('smartplan_refresh', {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/api/sesiones',
    });
  });

  it('acepta únicamente el origen configurado cuando está presente', () => {
    const config = configuracion(Entorno.Produccion);
    const permitida = {
      headers: { origin: 'https://app.smartplan.test' },
    } as Request;
    const rechazada = {
      headers: { origin: 'https://malicioso.test' },
    } as Request;

    expect(() => validarOrigenCookie(permitida, config)).not.toThrow();
    expect(() => validarOrigenCookie(rechazada, config)).toThrow();
  });
});
