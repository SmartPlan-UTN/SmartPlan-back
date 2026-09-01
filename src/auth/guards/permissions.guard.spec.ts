import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Repository } from 'typeorm';
import { RolePermission } from '../../users/entities/role-permission.entity';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(['permission.assign']),
  } as unknown as Reflector;
  const assignments = { find: jest.fn() } as unknown as jest.Mocked<
    Pick<Repository<RolePermission>, 'find'>
  >;
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({
        authentication: { role: { key: 'admin' } },
      }),
    }),
  };

  it('uses current assignments instead of permissions embedded in the token (CU61)', async () => {
    assignments.find.mockResolvedValue([
      { permission: { key: 'permission.assign' } } as RolePermission,
    ]);
    const guard = new PermissionsGuard(reflector, assignments);

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(assignments.find).toHaveBeenCalledWith({
      where: { role: { key: 'admin' } },
      relations: { permission: true },
    });
  });

  it('denies access immediately after a permission is revoked (CU61)', async () => {
    assignments.find.mockResolvedValue([]);
    const guard = new PermissionsGuard(reflector, assignments);

    await expect(guard.canActivate(context as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
