import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  AuditAction,
  AuditLog,
} from '../administration/entities/audit-log.entity';
import { AuditService } from '../common/audit/audit.service';
import { EnvironmentVariables } from '../config/environment-variables';
import { UserStatus } from '../users/entities/user-status.entity';
import { RolePermission } from '../users/entities/role-permission.entity';
import { Role } from '../users/entities/role.entity';
import { User } from '../users/entities/user.entity';
import { AuthService } from './auth.service';
import { EmailService } from './email/email.service';
import { PasswordRecovery } from './entities/password-recovery.entity';
import { UserSession } from './entities/user-session.entity';
import { PasswordService } from './security/password.service';
import { JwtAuthService } from './security/jwt-auth.service';
import { hashToken } from './security/token.util';

interface ConstructorEntidad {
  name: string;
}

describe('AuthService', () => {
  const role = { id: 2, key: 'user', name: 'User' } as Role;
  const status = { id: 1, key: 'active', name: 'Activo' } as UserStatus;
  let user: User;
  let session: UserSession;
  let createdRecovery: Record<string, unknown> | undefined;
  let enlaceEnviado = '';

  const manager = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const dataSource = {
    manager: manager,
    transaction: jest.fn(
      async (job: (entity: EntityManager) => Promise<unknown>) =>
        job(manager as unknown as EntityManager),
    ),
  };
  const users = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
  };
  const sessions = { findOne: jest.fn() };
  const recoveries = { update: jest.fn() };
  const passwords = {
    hash: jest.fn(() => Promise.resolve('hash-argon2')),
    verify: jest.fn(() => Promise.resolve(true)),
  };
  const jwt = {
    signAccess: jest.fn(() => Promise.resolve('access-signed')),
    signRefresh: jest.fn(() => Promise.resolve('new-refresh-token')),
    verifyRefresh: jest.fn(() =>
      Promise.resolve({
        sub: 7,
        sid: 11,
        type: 'refresh' as const,
      }),
    ),
  };
  const emailService = {
    sendPasswordRecovery: jest.fn((_destinatario: string, link: string) => {
      enlaceEnviado = link;
      return Promise.resolve();
    }),
  };
  const configuration = {
    get: jest.fn(() => 'https://app.smartplan.test'),
  };
  // Real instance, not a mock: AuditService has no dependencies of its own
  // and just calls manager.create/save with the shared `manager` mock above,
  // so the existing assertions on that mock still see the audit writes.
  const auditService = new AuditService();

  const service = new AuthService(
    dataSource as unknown as DataSource,
    users as unknown as Repository<User>,
    sessions as unknown as Repository<UserSession>,
    recoveries as unknown as Repository<PasswordRecovery>,
    passwords as unknown as PasswordService,
    jwt as unknown as JwtAuthService,
    emailService as unknown as EmailService,
    configuration as unknown as ConfigService<EnvironmentVariables, true>,
    auditService,
  );

  function queryBuilderCon(result: unknown) {
    const builder = {
      addSelect: jest.fn(),
      leftJoinAndSelect: jest.fn(),
      innerJoinAndSelect: jest.fn(),
      where: jest.fn(),
      setLock: jest.fn(),
      getOne: jest.fn(() => Promise.resolve(result)),
      getOneOrFail: jest.fn(() => Promise.resolve(result)),
    };
    for (const metodo of [
      'addSelect',
      'leftJoinAndSelect',
      'innerJoinAndSelect',
      'where',
      'setLock',
    ] as const) {
      builder[metodo].mockReturnValue(builder);
    }
    return builder;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    createdRecovery = undefined;
    enlaceEnviado = '';
    user = {
      id: 7,
      name: 'Ana',
      lastName: 'Pérez',
      email: 'ana@example.com',
      passwordHash: 'hash-argon2',
      idRole: role.id,
      idUserStatus: status.id,
      role,
      status,
    } as User;
    session = {
      id: 11,
      idUser: user.id,
      user,
      tokenHash: hashToken('old-refresh-token'),
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      active: true,
      ip: '127.0.0.1',
    } as UserSession;

    manager.create.mockImplementation(
      (entity: ConstructorEntidad, data: object) => {
        const createdEntity = { ...data };
        if (entity === PasswordRecovery) {
          createdRecovery = createdEntity;
        }
        return createdEntity;
      },
    );
    manager.save.mockImplementation((entity: object) => {
      const register = entity as Record<string, unknown>;
      if ('email' in register && !register.id) register.id = user.id;
      if ('startedAt' in register && !register.id) register.id = session.id;
      return Promise.resolve(entity);
    });
    manager.findOne.mockImplementation((entity: ConstructorEntidad) => {
      if (entity === Role) return role;
      if (entity === UserStatus) return status;
      if (entity === UserSession) return session;
      return Promise.resolve(null);
    });
    manager.find.mockResolvedValue([
      { permission: { key: 'profile.view' } },
    ] as RolePermission[]);
    manager.update.mockResolvedValue({ affected: 1 });
    passwords.hash.mockResolvedValue('hash-argon2');
    passwords.verify.mockResolvedValue(true);
    jwt.signAccess.mockResolvedValue('access-signed');
    jwt.signRefresh.mockResolvedValue('new-refresh-token');
    jwt.verifyRefresh.mockResolvedValue({
      sub: user.id,
      sid: session.id,
      type: 'refresh',
    });
    emailService.sendPasswordRecovery.mockImplementation(
      (_destinatario: string, link: string) => {
        enlaceEnviado = link;
        return Promise.resolve();
      },
    );
  });

  it('registers with role/status, creates session and audits without secrets', async () => {
    const result = await service.register(
      {
        name: ' Ana ',
        lastName: ' Pérez ',
        email: 'ana@example.com',
        password: 'secure-unit-test-password',
      },
      '127.0.0.1',
    );

    expect(passwords.hash).toHaveBeenCalledWith('secure-unit-test-password');
    expect(result.response).toMatchObject({
      accessToken: 'access-signed',
      user: { email: 'ana@example.com', role: { key: 'user' } },
    });
    expect(result.refreshToken).toBe('new-refresh-token');
    expect(manager.create).toHaveBeenCalledWith(
      AuditLog,
      expect.objectContaining({
        action: AuditAction.Create,
        affectedEntityId: user.id,
      }),
    );
    expect(JSON.stringify(manager.create.mock.calls)).not.toContain(
      'secure-unit-test-password',
    );
  });

  it('starts a session without logging out existing sessions and audits access', async () => {
    users.createQueryBuilder.mockReturnValue(queryBuilderCon(user));

    const result = await service.login(
      {
        email: user.email,
        password: 'secure-unit-test-password',
      },
      '127.0.0.1',
    );

    expect(passwords.verify).toHaveBeenCalledWith(
      user.passwordHash,
      'secure-unit-test-password',
    );
    expect(result.response.accessToken).toBe('access-signed');
    expect(manager.update).not.toHaveBeenCalledWith(
      UserSession,
      expect.anything(),
      expect.objectContaining({ active: false }),
    );
    expect(manager.create).toHaveBeenCalledWith(
      AuditLog,
      expect.objectContaining({ action: AuditAction.StartSession }),
    );
  });

  it('rejects incorrect credentials with a generic error', async () => {
    users.createQueryBuilder.mockReturnValue(queryBuilderCon(user));
    passwords.verify.mockResolvedValue(false);

    await expect(
      service.login(
        { email: user.email, password: 'incorrecta-but-larga' },
        null,
      ),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_CREDENTIALS' },
      status: 401,
    });
  });

  it('rotates the refresh under locking and detects its reuse', async () => {
    const builderValido = queryBuilderCon(session);
    manager.createQueryBuilder.mockReturnValue(builderValido);

    const result = await service.refresh('old-refresh-token');

    expect(builderValido.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(result.refreshToken).toBe('new-refresh-token');
    expect(session.tokenHash).toBe(hashToken('new-refresh-token'));

    session.tokenHash = hashToken('another-refresh');
    session.active = true;
    manager.createQueryBuilder.mockReturnValue(queryBuilderCon(session));
    await expect(service.refresh('old-refresh-token')).rejects.toMatchObject({
      response: { code: 'REFRESH_TOKEN_REUSED' },
      status: 401,
    });
    expect(session.active).toBe(false);
  });

  it('closes only the session specified and leaves the logout invalid idempotent', async () => {
    await service.logout('old-refresh-token');

    expect(session.active).toBe(false);
    expect(manager.create).toHaveBeenCalledWith(
      AuditLog,
      expect.objectContaining({ action: AuditAction.EndSession }),
    );

    jwt.verifyRefresh.mockRejectedValueOnce(new UnauthorizedException());
    await expect(service.logout('invalid')).resolves.toBeUndefined();
  });

  it("returns the current session's ip and start time", async () => {
    sessions.findOne.mockResolvedValue(session);

    await expect(
      service.getCurrentSession(user.id, session.id),
    ).resolves.toEqual({
      ip: session.ip,
      startedAt: session.startedAt.toISOString(),
    });
  });

  it('rejects getCurrentSession once the session no longer exists', async () => {
    sessions.findOne.mockResolvedValue(null);

    await expect(
      service.getCurrentSession(user.id, session.id),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('invalid requests previous and sends a token of recovery opaque', async () => {
    users.findOne.mockResolvedValue(user);
    const builder = queryBuilderCon(user);
    manager.createQueryBuilder.mockReturnValue(builder);

    await service.requestPasswordRecovery(user.email);

    expect(builder.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(manager.update).toHaveBeenCalledWith(
      PasswordRecovery,
      { idUser: user.id, used: false },
      { used: true },
    );
    expect(emailService.sendPasswordRecovery).toHaveBeenCalledWith(
      user.email,
      expect.stringMatching(
        /^https:\/\/app\.smartplan\.test\/reset-password\?token=.+/,
      ),
    );
    const token = new URL(enlaceEnviado).searchParams.get('token') ?? '';
    expect(createdRecovery?.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(createdRecovery)).not.toContain(token);
  });

  it('resets a once time under locking, revokes sessions and audits', async () => {
    const recovery = {
      id: 5,
      idUser: user.id,
      tokenHash: hashToken('valid-unit-test-recovery-token'),
      expiresAt: new Date(Date.now() + 60_000),
      used: false,
    } as PasswordRecovery;
    const builder = queryBuilderCon(recovery);
    manager.createQueryBuilder.mockReturnValue(builder);

    await service.resetPassword({
      token: 'valid-unit-test-recovery-token',
      newPassword: 'new-unit-test-password',
    });

    expect(builder.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(recovery.used).toBe(true);
    expect(manager.update).toHaveBeenCalledWith(User, user.id, {
      passwordHash: 'hash-argon2',
    });
    expect(manager.update).toHaveBeenCalledWith(
      UserSession,
      { idUser: user.id, active: true },
      { active: false },
    );
    expect(manager.create).toHaveBeenCalledWith(
      AuditLog,
      expect.objectContaining({ action: AuditAction.Update }),
    );
  });
});
