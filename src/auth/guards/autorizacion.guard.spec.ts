import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermisosGuard } from './permisos.guard';
import { RolesGuard } from './roles.guard';

function contextoConAutenticacion(
  rol: string,
  permisos: string[],
): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => ({
        autenticacion: { rol: { key: rol }, permisos },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('guards de autorización', () => {
  it('RolesGuard acepta cualquiera de los roles declarados', () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValue(['administrador', 'usuario']),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(contextoConAutenticacion('usuario', []))).toBe(
      true,
    );
  });

  it('PermisosGuard exige todos los permisos declarados', () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValue(['actividad.listar', 'actividad.consultar']),
    } as unknown as Reflector;
    const guard = new PermisosGuard(reflector);

    expect(() =>
      guard.canActivate(
        contextoConAutenticacion('usuario', ['actividad.listar']),
      ),
    ).toThrow(ForbiddenException);
  });
});
