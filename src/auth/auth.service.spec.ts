import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  AuditAction,
  AuditLog,
} from '../administration/entities/audit-log.entity';
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
  const status = { id: 1, key: 'activo', name: 'Activo' } as UserStatus;
  let user: User;
  let session: UserSession;
  let recuperacionCreada: Record<string, unknown> | undefined;
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
      async (trabajo: (entidad: EntityManager) => Promise<unknown>) =>
        trabajo(manager as unknown as EntityManager),
    ),
  };
  const users = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
  };
  const sessions = { findOne: jest.fn() };
  const recoveries = { update: jest.fn() };
  const contrasenas = {
    hash: jest.fn(() => Promise.resolve('hash-argon2')),
    verify: jest.fn(() => Promise.resolve(true)),
  };
  const jwt = {
    signAccess: jest.fn(() => Promise.resolve('access-firmado')),
    signRefresh: jest.fn(() => Promise.resolve('refresh-nuevo')),
    verifyRefresh: jest.fn(() =>
      Promise.resolve({
        sub: 7,
        sid: 11,
        tipo: 'refresh' as const,
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

  const servicio = new AuthService(
    dataSource as unknown as DataSource,
    users as unknown as Repository<User>,
    sessions as unknown as Repository<UserSession>,
    recoveries as unknown as Repository<PasswordRecovery>,
    contrasenas as unknown as PasswordService,
    jwt as unknown as JwtAuthService,
    emailService as unknown as EmailService,
    configuration as unknown as ConfigService<EnvironmentVariables, true>,
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
    recuperacionCreada = undefined;
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
      tokenHash: hashToken('refresh-viejo'),
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      active: true,
      ip: '127.0.0.1',
    } as UserSession;

    manager.create.mockImplementation(
      (entidad: ConstructorEntidad, datos: object) => {
        const creado = { ...datos };
        if (entidad === PasswordRecovery) {
          recuperacionCreada = creado;
        }
        return creado;
      },
    );
    manager.save.mockImplementation((entidad: object) => {
      const register = entidad as Record<string, unknown>;
      if ('email' in register && !register.id) register.id = user.id;
      if ('startedAt' in register && !register.id) register.id = session.id;
      return Promise.resolve(entidad);
    });
    manager.findOne.mockImplementation((entidad: ConstructorEntidad) => {
      if (entidad === Role) return role;
      if (entidad === UserStatus) return status;
      if (entidad === UserSession) return session;
      return Promise.resolve(null);
    });
    manager.find.mockResolvedValue([
      { permission: { key: 'perfil.consultar' } },
    ] as RolePermission[]);
    manager.update.mockResolvedValue({ affected: 1 });
    contrasenas.hash.mockResolvedValue('hash-argon2');
    contrasenas.verify.mockResolvedValue(true);
    jwt.signAccess.mockResolvedValue('access-firmado');
    jwt.signRefresh.mockResolvedValue('refresh-nuevo');
    jwt.verifyRefresh.mockResolvedValue({
      sub: user.id,
      sid: session.id,
      tipo: 'refresh',
    });
    emailService.sendPasswordRecovery.mockImplementation(
      (_destinatario: string, link: string) => {
        enlaceEnviado = link;
        return Promise.resolve();
      },
    );
  });

  it('registra con role/status, crea sesión y audita sin secretos', async () => {
    const result = await servicio.register(
      {
        name: ' Ana ',
        lastName: ' Pérez ',
        email: 'ana@example.com',
        password: 'password-unitaria-segura',
      },
      '127.0.0.1',
    );

    expect(contrasenas.hash).toHaveBeenCalledWith('password-unitaria-segura');
    expect(result.response).toMatchObject({
      accessToken: 'access-firmado',
      user: { email: 'ana@example.com', role: { key: 'user' } },
    });
    expect(result.refreshToken).toBe('refresh-nuevo');
    expect(manager.create).toHaveBeenCalledWith(
      AuditLog,
      expect.objectContaining({
        action: AuditAction.Create,
        affectedEntityId: user.id,
      }),
    );
    expect(JSON.stringify(manager.create.mock.calls)).not.toContain(
      'password-unitaria-segura',
    );
  });

  it('inicia sesión sin logout las existentes y audita el acceso', async () => {
    users.createQueryBuilder.mockReturnValue(queryBuilderCon(user));

    const result = await servicio.login(
      {
        email: user.email,
        password: 'password-unitaria-segura',
      },
      '127.0.0.1',
    );

    expect(contrasenas.verify).toHaveBeenCalledWith(
      user.passwordHash,
      'password-unitaria-segura',
    );
    expect(result.response.accessToken).toBe('access-firmado');
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

  it('rechaza credenciales incorrectas con un error genérico', async () => {
    users.createQueryBuilder.mockReturnValue(queryBuilderCon(user));
    contrasenas.verify.mockResolvedValue(false);

    await expect(
      servicio.login(
        { email: user.email, password: 'incorrecta-pero-larga' },
        null,
      ),
    ).rejects.toMatchObject({
      response: { code: 'CREDENCIALES_INVALIDAS' },
      status: 401,
    });
  });

  it('rota el refresh bajo bloqueo y detecta su reutilización', async () => {
    const builderValido = queryBuilderCon(session);
    manager.createQueryBuilder.mockReturnValue(builderValido);

    const result = await servicio.refresh('refresh-viejo');

    expect(builderValido.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(result.refreshToken).toBe('refresh-nuevo');
    expect(session.tokenHash).toBe(hashToken('refresh-nuevo'));

    session.tokenHash = hashToken('otro-refresh');
    session.active = true;
    manager.createQueryBuilder.mockReturnValue(queryBuilderCon(session));
    await expect(servicio.refresh('refresh-viejo')).rejects.toMatchObject({
      response: { code: 'REFRESH_REUTILIZADO' },
      status: 401,
    });
    expect(session.active).toBe(false);
  });

  it('cierra solo la sesión indicada y deja el logout inválido idempotente', async () => {
    await servicio.logout('refresh-viejo');

    expect(session.active).toBe(false);
    expect(manager.create).toHaveBeenCalledWith(
      AuditLog,
      expect.objectContaining({ action: AuditAction.EndSession }),
    );

    jwt.verifyRefresh.mockRejectedValueOnce(new UnauthorizedException());
    await expect(servicio.logout('invalido')).resolves.toBeUndefined();
  });

  it('invalida pedidos anteriores y envía un token de recuperación opaco', async () => {
    users.findOne.mockResolvedValue(user);
    const builder = queryBuilderCon(user);
    manager.createQueryBuilder.mockReturnValue(builder);

    await servicio.requestPasswordRecovery(user.email);

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
    expect(recuperacionCreada?.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(recuperacionCreada)).not.toContain(token);
  });

  it('restablece una sola vez bajo bloqueo, revoca sessions y audita', async () => {
    const recovery = {
      id: 5,
      idUser: user.id,
      tokenHash: hashToken('token-recovery-unitario-valido'),
      expiresAt: new Date(Date.now() + 60_000),
      used: false,
    } as PasswordRecovery;
    const builder = queryBuilderCon(recovery);
    manager.createQueryBuilder.mockReturnValue(builder);

    await servicio.resetPassword({
      token: 'token-recovery-unitario-valido',
      newPassword: 'password-nueva-unitaria',
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
