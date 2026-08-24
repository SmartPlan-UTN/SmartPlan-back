import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Activity } from '../activities/entities/activity.entity';
import { AuditLog } from '../administration/entities/audit-log.entity';
import { Plan } from './entities/plan.entity';
import { PlanDetail } from './entities/plan-detail.entity';
import { PlanStatus } from './entities/plan-status.entity';
import { PlanSuggestionsController } from './plan-suggestions.controller';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';
import { UserPlansController } from './user-plans.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Plan,
      PlanDetail,
      PlanStatus,
      Activity,
      AuditLog,
    ]),
  ],
  controllers: [
    PlansController,
    UserPlansController,
    PlanSuggestionsController,
  ],
  providers: [PlansService],
})
export class PlansModule {}
