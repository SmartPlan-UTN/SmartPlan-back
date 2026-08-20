import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';
import {
  AuditAction,
  AuditLog,
} from '../administration/entities/audit-log.entity';
import { EnvironmentVariables } from '../config/environment-variables';
import { USER_STATUSES, USER_ROLE } from '../database/seeds/definitions';
import { UserStatus } from '../users/entities/user-status.entity';
import { RolePermission } from '../users/entities/role-permission.entity';
import { Role } from '../users/entities/role.entity';
import { User } from '../users/entities/user.entity';
import {
  ACCESS_DURATION_SECONDS,
  PASSWORD_RECOVERY_DURATION_MILLISECONDS,
  REFRESH_DURATION_SECONDS,
} from './auth.constants';
import { EmailService } from './email/email.service';
import { LoginDto } from './dto/login.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import {
  AuthenticationResponseDto,
  AuthenticationResult,
  SessionUserDto,
} from './dto/authentication-response.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { PasswordRecovery } from './entities/password-recovery.entity';
import { UserSession } from './entities/user-session.entity';
import { PasswordService } from './security/password.service';
import { JwtAuthService } from './security/jwt-auth.service';
import { TokenClaims } from './security/jwt-auth.service';
import {
  createOpaqueToken,
  hashToken,
  hashesMatch,
} from './security/token.util';

type RotationError = 'invalido' | 'reutilizado';

@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(UserSession)
    private readonly sessions: Repository<UserSession>,
    @InjectRepository(PasswordRecovery)
    private readonly recoveries: Repository<PasswordRecovery>,
    private readonly contrasenas: PasswordService,
    private readonly jwt: JwtAuthService,
    private readonly emailService: EmailService,
    private readonly configuration: ConfigService<EnvironmentVariables, true>,
  ) {}

  async register(
    dto: RegisterUserDto,
    ip: string | null,
  ): Promise<AuthenticationResult> {
    const passwordHash = await this.contrasenas.hash(dto.password);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const role = await manager.findOne(Role, { where: { key: USER_ROLE } });
        const status = await manager.findOne(UserStatus, {
          where: { key: USER_STATUSES[0]?.key ?? 'activo' },
        });
        if (!role || !status) {
          throw new ServiceUnavailableException({
            code: 'CATALOGOS_NO_INICIALIZADOS',
            message: 'Los catálogos de autenticación no están inicializados',
          });
        }

        const user = await manager.save(
          manager.create(User, {
            name: dto.name.trim(),
            lastName: dto.lastName.trim(),
            email: dto.email,
            passwordHash,
            idRole: role.id,
            idUserStatus: status.id,
          }),
        );
        user.role = role;
        user.status = status;

        const result = await this.createSession(manager, user, ip);
        await this.audit(manager, AuditAction.Create, user.id, {
          email: user.email,
        });
        return result;
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      ) {
        throw new ConflictException({
          code: 'EMAIL_YA_REGISTRADO',
          message: 'El email ya está registrado',
        });
      }
      throw error;
    }
  }

  async login(dto: LoginDto, ip: string | null): Promise<AuthenticationResult> {
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .leftJoinAndSelect('user.role', 'role')
      .leftJoinAndSelect('user.status', 'status')
      .where('user.email = :email', { email: dto.email })
      .getOne();

    if (
      !user ||
      !(await this.contrasenas.verify(user.passwordHash, dto.password))
    ) {
      throw new UnauthorizedException({
        code: 'CREDENCIALES_INVALIDAS',
        message: 'El email o la contraseña no son correctos',
      });
    }
    this.requireActiveUser(user);

    return this.dataSource.transaction(async (manager) => {
      const result = await this.createSession(manager, user, ip);
      await this.audit(manager, AuditAction.StartSession, user.id, null);
      return result;
    });
  }

  async refresh(
    refreshToken: string,
    claimsVerificados?: TokenClaims,
  ): Promise<AuthenticationResult> {
    const claims =
      claimsVerificados ?? (await this.jwt.verifyRefresh(refreshToken));
    const result = await this.dataSource.transaction(async (manager) => {
      const session = await manager
        .createQueryBuilder(UserSession, 'session')
        .setLock('pessimistic_write')
        .innerJoinAndSelect('session.user', 'user')
        .innerJoinAndSelect('user.role', 'role')
        .innerJoinAndSelect('user.status', 'status')
        .where('session.id = :id AND session.id_usuario = :idUser', {
          id: claims.sid,
          idUser: claims.sub,
        })
        .getOne();

      if (!session || !session.active || session.expiresAt <= new Date()) {
        return { error: 'invalido' as RotationError };
      }

      if (!hashesMatch(session.tokenHash, hashToken(refreshToken))) {
        session.active = false;
        await manager.save(session);
        return { error: 'reutilizado' as RotationError };
      }

      this.requireActiveUser(session.user);
      const nuevoRefresh = await this.jwt.signRefresh(
        session.idUser,
        session.id,
      );
      session.tokenHash = hashToken(nuevoRefresh);
      session.expiresAt = this.refreshExpirationDate();
      await manager.save(session);
      return this.buildResult(manager, session.user, session.id, nuevoRefresh);
    });

    if ('error' in result) {
      if (result.error === 'reutilizado') {
        throw new UnauthorizedException({
          code: 'REFRESH_REUTILIZADO',
          message: 'La sesión fue revocada por reutilización del token',
        });
      }
      throw new UnauthorizedException({
        code: 'SESION_INVALIDA',
        message: 'La sesión no existe, fue revocada o venció',
      });
    }
    return result;
  }

  async logout(refreshToken?: string): Promise<void> {
    if (!refreshToken) return;
    try {
      const claims = await this.jwt.verifyRefresh(refreshToken);
      await this.dataSource.transaction(async (manager) => {
        const session = await manager.findOne(UserSession, {
          where: { id: claims.sid, idUser: claims.sub },
        });
        if (!session?.active) return;
        session.active = false;
        await manager.save(session);
        await this.audit(manager, AuditAction.EndSession, claims.sub, null);
      });
    } catch (error) {
      if (error instanceof UnauthorizedException) return;
      throw error;
    }
  }

  async requestPasswordRecovery(email: string): Promise<void> {
    const user = await this.users.findOne({ where: { email } });
    if (!user) {
      throw new NotFoundException({
        code: 'EMAIL_NO_REGISTRADO',
        message: 'No existe una cuenta registrada con ese email',
      });
    }

    const token = createOpaqueToken();
    const ahora = new Date();
    const recovery = await this.dataSource.transaction(async (manager) => {
      await manager
        .createQueryBuilder(User, 'user')
        .setLock('pessimistic_write')
        .where('user.id = :idUser', { idUser: user.id })
        .getOneOrFail();
      await manager.update(
        PasswordRecovery,
        { idUser: user.id, used: false },
        { used: true },
      );
      return manager.save(
        manager.create(PasswordRecovery, {
          idUser: user.id,
          tokenHash: hashToken(token),
          tokenCreatedAt: ahora,
          expiresAt: new Date(
            ahora.getTime() + PASSWORD_RECOVERY_DURATION_MILLISECONDS,
          ),
          used: false,
        }),
      );
    });

    const link = `${this.configuration.get('FRONTEND_URL', { infer: true })}/reset-password?token=${encodeURIComponent(token)}`;
    try {
      await this.emailService.sendPasswordRecovery(user.email, link);
    } catch (error) {
      await this.recoveries.update(recovery.id, { used: true });
      throw error;
    }
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tokenHash = hashToken(dto.token);
    const passwordHash = await this.contrasenas.hash(dto.newPassword);
    await this.dataSource.transaction(async (manager) => {
      const recovery = await manager
        .createQueryBuilder(PasswordRecovery, 'recovery')
        .setLock('pessimistic_write')
        .where('recovery.token_hash = :tokenHash', { tokenHash })
        .getOne();
      if (!recovery) {
        throw new BadRequestException({
          code: 'TOKEN_RECUPERACION_INVALIDO',
          message: 'El token de recuperación no es válido',
        });
      }
      if (recovery.used) {
        throw new ConflictException({
          code: 'TOKEN_RECUPERACION_USADO',
          message: 'El token de recuperación ya fue utilizado',
        });
      }
      if (recovery.expiresAt <= new Date()) {
        throw new GoneException({
          code: 'TOKEN_RECUPERACION_VENCIDO',
          message: 'El token de recuperación está vencido',
        });
      }

      recovery.used = true;
      await manager.save(recovery);
      await manager.update(User, recovery.idUser, { passwordHash });
      await manager.update(
        UserSession,
        { idUser: recovery.idUser, active: true },
        { active: false },
      );
      await this.audit(manager, AuditAction.Update, recovery.idUser, {
        password: 'restablecida',
      });
    });
  }

  async getCurrentAuthentication(
    idUser: number,
    idSession: number,
  ): Promise<SessionUserDto & { idSession: number }> {
    const session = await this.sessions.findOne({
      where: { id: idSession, idUser, active: true },
      relations: { user: { role: true, status: true } },
    });
    if (!session || session.expiresAt <= new Date()) {
      throw new UnauthorizedException({
        code: 'SESION_INVALIDA',
        message: 'La sesión no existe, fue revocada o venció',
      });
    }
    this.requireActiveUser(session.user);
    return {
      ...(await this.buildUser(this.dataSource.manager, session.user)),
      idSession,
    };
  }

  private async createSession(
    manager: EntityManager,
    user: User,
    ip: string | null,
  ): Promise<AuthenticationResult> {
    const session = await manager.save(
      manager.create(UserSession, {
        idUser: user.id,
        tokenHash: hashToken(createOpaqueToken()),
        startedAt: new Date(),
        expiresAt: this.refreshExpirationDate(),
        active: true,
        ip,
      }),
    );
    const refreshToken = await this.jwt.signRefresh(user.id, session.id);
    session.tokenHash = hashToken(refreshToken);
    await manager.save(session);
    return this.buildResult(manager, user, session.id, refreshToken);
  }

  private async buildResult(
    manager: EntityManager,
    user: User,
    idSession: number,
    refreshToken: string,
  ): Promise<AuthenticationResult> {
    const response: AuthenticationResponseDto = {
      accessToken: await this.jwt.signAccess(user.id, idSession),
      tokenType: 'Bearer',
      expiresIn: ACCESS_DURATION_SECONDS,
      user: await this.buildUser(manager, user),
    };
    return { response, refreshToken };
  }

  private async buildUser(
    manager: EntityManager,
    user: User,
  ): Promise<SessionUserDto> {
    const assignments = await manager.find(RolePermission, {
      where: { idRole: user.idRole },
      relations: { permission: true },
    });
    return {
      id: user.id,
      name: user.name,
      lastName: user.lastName,
      email: user.email,
      role: { key: user.role.key, name: user.role.name },
      permissions: assignments.map(({ permission }) => permission.key).sort(),
    };
  }

  private requireActiveUser(user: User): void {
    if (user.status.key === 'activo') return;
    const suspendido = user.status.key === 'suspendido';
    throw new ForbiddenException({
      code: suspendido ? 'CUENTA_SUSPENDIDA' : 'CUENTA_BANEADA',
      message: suspendido
        ? 'La cuenta está suspendida'
        : 'La cuenta está baneada',
    });
  }

  private refreshExpirationDate(): Date {
    return new Date(Date.now() + REFRESH_DURATION_SECONDS * 1000);
  }

  private async audit(
    manager: EntityManager,
    action: AuditAction,
    idUser: number,
    changes: Record<string, unknown> | null,
  ): Promise<void> {
    await manager.save(
      manager.create(AuditLog, {
        action,
        affectedEntity: 'user',
        affectedEntityId: idUser,
        original: null,
        changes,
      }),
    );
  }
}
