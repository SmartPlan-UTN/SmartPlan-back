import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Activity } from '../activities/entities/activity.entity';
import { AuditLog } from '../administration/entities/audit-log.entity';
import { Feedback } from '../recommendation/entities/feedback.entity';
import { Plan } from './entities/plan.entity';
import { PlanDetail } from './entities/plan-detail.entity';
import { PlanStatus } from './entities/plan-status.entity';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { PlanRecommendationsController } from './plan-recommendations.controller';
import { PlanRecommendationsService } from './plan-recommendations.service';
import { PlanSelectionController } from './plan-selection.controller';
import { PlanSelectionService } from './plan-selection.service';
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
      Feedback,
    ]),
  ],
  controllers: [
    PlansController,
    UserPlansController,
    PlanSuggestionsController,
    PlanSelectionController,
    PlanRecommendationsController,
    FeedbackController,
  ],
  providers: [
    PlansService,
    PlanSelectionService,
    PlanRecommendationsService,
    FeedbackService,
  ],
  exports: [PlansService],
})
export class PlansModule {}
