import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(['permission.assign']),
  } as unknown as Reflector;
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({
        authentication: {
          role: { key: 'admin' },
          permissions: ['permission.assign'],
        },
      }),
    }),
  };

  it('uses permissions loaded into the current authentication (CU61)', () => {
    const guard = new PermissionsGuard(reflector);
    expect(guard.canActivate(context as never)).toBe(true);
  });

  it('denies access immediately after a permission is revoked (CU61)', () => {
    const revokedContext = {
      ...context,
      switchToHttp: () => ({
        getRequest: () => ({
          authentication: { role: { key: 'admin' }, permissions: [] },
        }),
      }),
    };
    const guard = new PermissionsGuard(reflector);

    expect(() => guard.canActivate(revokedContext as never)).toThrow(
      ForbiddenException,
    );
  });
});
