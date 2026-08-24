import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Feedback } from '../recommendation/entities/feedback.entity';
import { Plan } from './entities/plan.entity';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { PlanRecommendationsController } from './plan-recommendations.controller';
import { PlanRecommendationsService } from './plan-recommendations.service';
import { PlanSelectionController } from './plan-selection.controller';
import { PlanSelectionService } from './plan-selection.service';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';

@Module({
  imports: [TypeOrmModule.forFeature([Plan, Feedback])],
  controllers: [
    PlansController,
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
