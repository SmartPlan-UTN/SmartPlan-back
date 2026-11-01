import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { ApiController } from '../common/swagger/api-controller.decorator';
import type { SessionUserDto } from '../auth/dto/authentication-response.dto';
import { PlanRecommendationQueryDto } from './dto/plan-recommendation-query.dto';
import { PlanRecommendationsService } from './plan-recommendations.service';

@ApiController({ tag: 'Plan recommendations', authenticated: true })
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

  /** Stop recommending this plan to the caller (CU21). Idempotent. */
  @Post(':planId/dismiss')
  @Permissions('recommendation.dismiss')
  @HttpCode(HttpStatus.NO_CONTENT)
  dismiss(
    @CurrentUser() user: SessionUserDto,
    @Param('planId', ParseIntPipe) planId: number,
  ): Promise<void> {
    return this.planRecommendations.dismiss(user.id, planId);
  }

  /** Undo a dismissal — the "Deshacer" window (CU21). Idempotent. */
  @Delete(':planId/dismiss')
  @Permissions('recommendation.dismiss')
  @HttpCode(HttpStatus.NO_CONTENT)
  restore(
    @CurrentUser() user: SessionUserDto,
    @Param('planId', ParseIntPipe) planId: number,
  ): Promise<void> {
    return this.planRecommendations.restore(user.id, planId);
  }
}
