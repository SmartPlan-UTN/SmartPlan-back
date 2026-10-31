import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { PasswordService } from '../auth/security/password.service';
import { AuditService } from '../common/audit/audit.service';
import { Role } from '../users/entities/role.entity';
import { UserStatus } from '../users/entities/user-status.entity';
import { User } from '../users/entities/user.entity';
import { AdminUsersService } from './admin-users.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';

describe('AdminUsersService', () => {
  const dto: CreateAdminUserDto = {
    name: 'Martina',
    lastName: 'García',
    email: 'martina@example.com',
    password: 'Segura123.',
    role: 'admin',
    status: 'active',
  };
  const role = { id: 2, key: 'admin', name: 'Administrator' };
  const status = { id: 1, key: 'active', name: 'Active' };

  let manager: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let passwords: { hash: jest.Mock };
  let auditService: { record: jest.Mock };
  let service: AdminUsersService;

  function lookups(found: {
    user?: unknown;
    role?: unknown;
    status?: unknown;
  }) {
    manager.findOne.mockImplementation((entity: unknown) => {
      if (entity === User) return Promise.resolve(found.user ?? null);
      if (entity === Role) return Promise.resolve(found.role ?? null);
      if (entity === UserStatus) return Promise.resolve(found.status ?? null);
      return Promise.resolve(null);
    });
  }

  beforeEach(() => {
    manager = {
      findOne: jest.fn(),
      create: jest.fn((_entity: unknown, value: object) => value),
      save: jest.fn((value: object) =>
        Promise.resolve({
          ...value,
          id: 15,
          createdAt: new Date('2026-10-16T12:00:00.000Z'),
          updatedAt: new Date('2026-10-16T12:00:00.000Z'),
        }),
      ),
    };
    passwords = { hash: jest.fn().mockResolvedValue('argon2-hash') };
    auditService = { record: jest.fn() };
    service = new AdminUsersService(
      {
        transaction: (callback: (entityManager: typeof manager) => unknown) =>
          callback(manager),
      } as unknown as DataSource,
      passwords as unknown as PasswordService,
      auditService as unknown as AuditService,
    );
  });

  it('creates the account with a hashed password and audits who created it (CU57)', async () => {
    lookups({ role, status });

    await expect(service.createUser(7, dto)).resolves.toMatchObject({
      id: 15,
      email: 'martina@example.com',
      role: { key: 'admin', name: 'Administrator' },
      status: { key: 'active', name: 'Active' },
    });
    expect(passwords.hash).toHaveBeenCalledWith('Segura123.');
    expect(manager.create).toHaveBeenCalledWith(
      User,
      expect.objectContaining({
        passwordHash: 'argon2-hash',
        idRole: 2,
        idUserStatus: 1,
      }),
    );
    expect(auditService.record).toHaveBeenCalledWith(
      manager,
      'create',
      'user',
      15,
      { email: 'martina@example.com', role: 'admin', status: 'active' },
      7,
    );
  });

  it('rejects an email that is already registered, even by a deleted account', async () => {
    lookups({ user: { id: 3 }, role, status });

    await expect(service.createUser(7, dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(manager.findOne).toHaveBeenCalledWith(User, {
      where: { email: 'martina@example.com' },
      withDeleted: true,
    });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('turns a unique-index race into the same conflict', async () => {
    lookups({ role, status });
    manager.save.mockRejectedValue(
      new QueryFailedError('INSERT', [], {
        code: '23505',
        constraint: 'IDX_user_email_unique',
      } as never),
    );

    await expect(service.createUser(7, dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects a role that does not exist', async () => {
    lookups({ status });

    await expect(service.createUser(7, dto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(manager.save).not.toHaveBeenCalled();
  });
});
