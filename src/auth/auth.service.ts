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
import { AuditAction } from '../administration/entities/audit-log.entity';
import { AuditService } from '../common/audit/audit.service';
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

type RotationError = 'invalid' | 'reused';

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
    private readonly passwords: PasswordService,
    private readonly jwt: JwtAuthService,
    private readonly emailService: EmailService,
    private readonly configuration: ConfigService<EnvironmentVariables, true>,
    private readonly auditService: AuditService,
  ) {}

  async register(
    dto: RegisterUserDto,
    ip: string | null,
  ): Promise<AuthenticationResult> {
    const passwordHash = await this.passwords.hash(dto.password);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const role = await manager.findOne(Role, { where: { key: USER_ROLE } });
        const status = await manager.findOne(UserStatus, {
          where: { key: USER_STATUSES[0]?.key ?? 'active' },
        });
        if (!role || !status) {
          throw new ServiceUnavailableException({
            code: 'CATALOGS_NOT_INITIALIZED',
            message: 'The authentication catalogs are not initialized',
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
        await this.auditService.recordUserAction(
          manager,
          AuditAction.Create,
          user.id,
          {
            email: user.email,
          },
        );
        return result;
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      ) {
        throw new ConflictException({
          code: 'EMAIL_ALREADY_REGISTERED',
          message: 'The email address is already registered',
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
      !(await this.passwords.verify(user.passwordHash, dto.password))
    ) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'The email address or password is incorrect',
      });
    }
    this.requireActiveUser(user);

    return this.dataSource.transaction(async (manager) => {
      const result = await this.createSession(manager, user, ip);
      await this.auditService.recordUserAction(
        manager,
        AuditAction.StartSession,
        user.id,
        null,
      );
      return result;
    });
  }

  async refresh(
    refreshToken: string,
    verifiedClaims?: TokenClaims,
  ): Promise<AuthenticationResult> {
    const claims =
      verifiedClaims ?? (await this.jwt.verifyRefresh(refreshToken));
    const result = await this.dataSource.transaction(async (manager) => {
      const session = await manager
        .createQueryBuilder(UserSession, 'session')
        .setLock('pessimistic_write')
        .innerJoinAndSelect('session.user', 'user')
        .innerJoinAndSelect('user.role', 'role')
        .innerJoinAndSelect('user.status', 'status')
        .where('session.id = :id AND session.id_user = :idUser', {
          id: claims.sid,
          idUser: claims.sub,
        })
        .getOne();

      if (!session || !session.active || session.expiresAt <= new Date()) {
        return { error: 'invalid' as RotationError };
      }

      if (!hashesMatch(session.tokenHash, hashToken(refreshToken))) {
        session.active = false;
        await manager.save(session);
        return { error: 'reused' as RotationError };
      }

      this.requireActiveUser(session.user);
      const newRefreshToken = await this.jwt.signRefresh(
        session.idUser,
        session.id,
      );
      session.tokenHash = hashToken(newRefreshToken);
      session.expiresAt = this.refreshExpirationDate();
      await manager.save(session);
      return this.buildResult(
        manager,
        session.user,
        session.id,
        newRefreshToken,
      );
    });

    if ('error' in result) {
      if (result.error === 'reused') {
        throw new UnauthorizedException({
          code: 'REFRESH_TOKEN_REUSED',
          message: 'The session was revoked because the token was reused',
        });
      }
      throw new UnauthorizedException({
        code: 'INVALID_SESSION',
        message: 'The session does not exist, was revoked, or expired',
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
        await this.auditService.recordUserAction(
          manager,
          AuditAction.EndSession,
          claims.sub,
          null,
        );
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
        code: 'EMAIL_NOT_REGISTERED',
        message: 'No account is registered with that email address',
      });
    }

    const token = createOpaqueToken();
    const now = new Date();
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
          tokenCreatedAt: now,
          expiresAt: new Date(
            now.getTime() + PASSWORD_RECOVERY_DURATION_MILLISECONDS,
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
    const passwordHash = await this.passwords.hash(dto.newPassword);
    await this.dataSource.transaction(async (manager) => {
      const recovery = await manager
        .createQueryBuilder(PasswordRecovery, 'recovery')
        .setLock('pessimistic_write')
        .where('recovery.token_hash = :tokenHash', { tokenHash })
        .getOne();
      if (!recovery) {
        throw new BadRequestException({
          code: 'INVALID_RECOVERY_TOKEN',
          message: 'The recovery token is invalid',
        });
      }
      if (recovery.used) {
        throw new ConflictException({
          code: 'RECOVERY_TOKEN_ALREADY_USED',
          message: 'The recovery token has already been used',
        });
      }
      if (recovery.expiresAt <= new Date()) {
        throw new GoneException({
          code: 'EXPIRED_RECOVERY_TOKEN',
          message: 'The recovery token has expired',
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
      await this.auditService.recordUserAction(
        manager,
        AuditAction.Update,
        recovery.idUser,
        {
          password: 'reset',
        },
      );
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
        code: 'INVALID_SESSION',
        message: 'The session does not exist, was revoked, or expired',
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
    if (user.status.key === 'active') return;
    const isSuspended = user.status.key === 'suspended';
    throw new ForbiddenException({
      code: isSuspended ? 'ACCOUNT_SUSPENDED' : 'ACCOUNT_BANNED',
      message: isSuspended
        ? 'The account is suspended'
        : 'The account is banned',
    });
  }

  private refreshExpirationDate(): Date {
    return new Date(Date.now() + REFRESH_DURATION_SECONDS * 1000);
  }
}
