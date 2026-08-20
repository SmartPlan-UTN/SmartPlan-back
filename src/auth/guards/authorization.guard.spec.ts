import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { RolesGuard } from './roles.guard';

function contextoConAutenticacion(
  role: string,
  permissions: string[],
): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => ({
        authentication: { role: { key: role }, permissions },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('guards de autorización', () => {
  it('RolesGuard acepta cualquiera de los roles declarados', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['administrador', 'user']),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(contextoConAutenticacion('user', []))).toBe(true);
  });

  it('PermissionsGuard exige todos los permissions declarados', () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValue(['actividad.listar', 'actividad.consultar']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(() =>
      guard.canActivate(contextoConAutenticacion('user', ['actividad.listar'])),
    ).toThrow(ForbiddenException);
  });
});
