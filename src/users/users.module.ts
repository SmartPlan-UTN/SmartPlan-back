import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../administration/entities/audit-log.entity';
import { AuthModule } from '../auth/auth.module';
import { Category } from '../categories/entities/category.entity';
import { PasswordRecovery } from '../auth/entities/password-recovery.entity';
import { UserSession } from '../auth/entities/user-session.entity';
import { User } from './entities/user.entity';
import { UserPreference } from './entities/user-preference.entity';
import { UserPreferenceProfile } from './entities/user-preference-profile.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      User,
      UserPreference,
      UserPreferenceProfile,
      Category,
      UserSession,
      PasswordRecovery,
      AuditLog,
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
