import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { RolesGuard } from './roles.guard';

function contextWithAuthentication(
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

describe('guards of authorization', () => {
  it('RolesGuard accepts any declared role', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['admin', 'user']),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(contextWithAuthentication('user', []))).toBe(true);
  });

  it('PermissionsGuard requires all the permissions declared', () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValue(['activity.list', 'activity.view']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(() =>
      guard.canActivate(contextWithAuthentication('user', ['activity.list'])),
    ).toThrow(ForbiddenException);
  });
});
