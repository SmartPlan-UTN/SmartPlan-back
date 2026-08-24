import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../administration/entities/audit-log.entity';
import { AuditService } from '../common/audit/audit.service';
import { UserStatus } from '../users/entities/user-status.entity';
import { Permission } from '../users/entities/permission.entity';
import { RolePermission } from '../users/entities/role-permission.entity';
import { Role } from '../users/entities/role.entity';
import { User } from '../users/entities/user.entity';
import { AuthService } from './auth.service';
import { EmailService } from './email/email.service';
import { PasswordRecovery } from './entities/password-recovery.entity';
import { UserSession } from './entities/user-session.entity';
import { AuthenticationGuard } from './guards/authentication.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { RolesGuard } from './guards/roles.guard';
import { PasswordRecoveriesController } from './password-recoveries.controller';
import { PasswordService } from './security/password.service';
import { JwtAuthService } from './security/jwt-auth.service';
import { AttemptLimiterService } from './security/attempt-limiter.service';
import { SessionsController } from './sessions.controller';
import { UsersAuthController } from './users-auth.controller';

@Module({
  imports: [
    JwtModule.register({}),
    ThrottlerModule.forRoot(),
    TypeOrmModule.forFeature([
      User,
      Role,
      Permission,
      RolePermission,
      UserStatus,
      UserSession,
      PasswordRecovery,
      AuditLog,
    ]),
  ],
  controllers: [
    UsersAuthController,
    SessionsController,
    PasswordRecoveriesController,
  ],
  providers: [
    AuthService,
    PasswordService,
    JwtAuthService,
    EmailService,
    AttemptLimiterService,
    AuditService,
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [AuthService, PasswordService, JwtAuthService, AuditService],
})
export class AuthModule {}
