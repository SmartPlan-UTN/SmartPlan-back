import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Activity } from '../activities/entities/activity.entity';
import { AuditLog } from '../administration/entities/audit-log.entity';
import { AuthModule } from '../auth/auth.module';
import { OptionalAuthenticationGuard } from '../auth/guards/optional-authentication.guard';
import { Feedback } from '../recommendation/entities/feedback.entity';
import { MediaModule } from '../media/media.module';
import { DismissedRecommendation } from './entities/dismissed-recommendation.entity';
import { Plan } from './entities/plan.entity';
import { PlanDetail } from './entities/plan-detail.entity';
import { PlanStatus } from './entities/plan-status.entity';
import { ActivitySuggestionsController } from './activity-suggestions.controller';
import { ActivitySuggestionsService } from './activity-suggestions.service';
import { ExperiencesController } from './experiences.controller';
import { ExperiencesService } from './experiences.service';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { PlanRecommendationsController } from './plan-recommendations.controller';
import { PlanRecommendationsService } from './plan-recommendations.service';
import { OutingsController } from './outings.controller';
import { OutingsService } from './outings.service';
import { PlanSuggestionsController } from './plan-suggestions.controller';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';
import { UserPlansController } from './user-plans.controller';

@Module({
  imports: [
    AuthModule,
    MediaModule,
    TypeOrmModule.forFeature([
      Plan,
      PlanDetail,
      PlanStatus,
      DismissedRecommendation,
      Activity,
      AuditLog,
      Feedback,
    ]),
  ],
  controllers: [
    PlansController,
    UserPlansController,
    PlanSuggestionsController,
    OutingsController,
    PlanRecommendationsController,
    FeedbackController,
    ExperiencesController,
    ActivitySuggestionsController,
  ],
  providers: [
    PlansService,
    OutingsService,
    PlanRecommendationsService,
    FeedbackService,
    ExperiencesService,
    ActivitySuggestionsService,
    OptionalAuthenticationGuard,
  ],
  exports: [PlansService],
})
export class PlansModule {}
