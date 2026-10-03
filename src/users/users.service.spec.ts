import { NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { PasswordService } from '../auth/security/password.service';
import { AuditService } from '../common/audit/audit.service';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let users: jest.Mocked<Pick<Repository<User>, 'findOne'>>;
  let service: UsersService;

  beforeEach(() => {
    users = { findOne: jest.fn() };
    service = new UsersService(
      { manager: { findOne: users.findOne } } as unknown as DataSource,
      users as unknown as Repository<User>,
      {} as PasswordService,
      // Unused by the tests below: none of them exercise a path that
      // writes an audit entry.
      {} as AuditService,
    );
  });

  it('returns the authenticated user profile without sensitive fields (CU5)', async () => {
    users.findOne.mockResolvedValue({
      id: 4,
      name: 'Ana',
      lastName: 'Pérez',
      email: 'ana@example.com',
      phone: undefined,
      avatarUrl: null,
      passwordHash: 'never-returned',
      role: { key: 'user', name: 'User' },
      status: { key: 'active', name: 'Active' },
    } as User);

    await expect(service.getProfile(4)).resolves.toEqual({
      id: 4,
      name: 'Ana',
      lastName: 'Pérez',
      email: 'ana@example.com',
      phone: undefined,
      avatarUrl: null,
      role: { key: 'user', name: 'User' },
      status: { key: 'active', name: 'Active' },
    });
  });

  it('rejects a profile that no longer exists (CU5)', async () => {
    users.findOne.mockResolvedValue(null);

    await expect(service.getProfile(99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
