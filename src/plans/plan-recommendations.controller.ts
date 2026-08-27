import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { SessionUserDto } from '../auth/dto/authentication-response.dto';
import { PlanRecommendationQueryDto } from './dto/plan-recommendation-query.dto';
import { PlanRecommendationsService } from './plan-recommendations.service';

@Controller('plan-recommendations')
export class PlanRecommendationsController {
  constructor(
    private readonly planRecommendations: PlanRecommendationsService,
  ) {}

  @Get()
  recommend(
    @CurrentUser() user: SessionUserDto,
    @Query() query: PlanRecommendationQueryDto,
  ) {
    return this.planRecommendations.recommend(user.id, query);
  }
}
