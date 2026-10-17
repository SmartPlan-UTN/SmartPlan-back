import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Activity } from '../activities/entities/activity.entity';
import { PasswordService } from '../auth/security/password.service';
import { AuditService } from '../common/audit/audit.service';
import { ContentReportsModule } from '../content-reports/content-reports.module';
import { Plan } from '../plans/entities/plan.entity';
import { Feedback } from '../recommendation/entities/feedback.entity';
import { FeedbackStatus } from '../recommendation/entities/feedback-status.entity';
import { Rating } from '../ratings/entities/rating.entity';
import { Permission } from '../users/entities/permission.entity';
import { RolePermission } from '../users/entities/role-permission.entity';
import { Role } from '../users/entities/role.entity';
import { User } from '../users/entities/user.entity';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { AdministrationController } from './administration.controller';
import { AdministrationService } from './administration.service';
import { AuditLog } from './entities/audit-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Activity,
      Plan,
      Rating,
      Permission,
      Role,
      RolePermission,
      Feedback,
      FeedbackStatus,
      AuditLog,
    ]),
    ContentReportsModule,
  ],
  controllers: [AdministrationController, AdminUsersController],
  providers: [
    AdministrationService,
    AdminUsersService,
    AuditService,
    PasswordService,
  ],
})
export class AdministrationModule {}
