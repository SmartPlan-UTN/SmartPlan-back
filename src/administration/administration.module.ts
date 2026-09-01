import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Activity } from '../activities/entities/activity.entity';
import { AuditService } from '../common/audit/audit.service';
import { Plan } from '../plans/entities/plan.entity';
import { Rating } from '../ratings/entities/rating.entity';
import { Permission } from '../users/entities/permission.entity';
import { RolePermission } from '../users/entities/role-permission.entity';
import { Role } from '../users/entities/role.entity';
import { User } from '../users/entities/user.entity';
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
      AuditLog,
    ]),
  ],
  controllers: [AdministrationController],
  providers: [AdministrationService, AuditService],
})
export class AdministrationModule {}
