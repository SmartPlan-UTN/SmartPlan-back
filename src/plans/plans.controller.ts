import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { SessionUserDto } from '../auth/dto/authentication-response.dto';
import { OptionalUser } from '../auth/decorators/optional-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { OptionalAuthenticationGuard } from '../auth/guards/optional-authentication.guard';
import { ApiController } from '../common/swagger/api-controller.decorator';
import { PlanSearchQueryDto } from './dto/plan-search-query.dto';
import { PlansService } from './plans.service';

@Public()
@ApiController({ tag: 'Plans' })
@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  @UseGuards(OptionalAuthenticationGuard)
  search(
    @Query() query: PlanSearchQueryDto,
    @OptionalUser() user?: SessionUserDto,
  ) {
    return this.plansService.search(query, user?.id ?? null);
  }

  /**
   * Stays public (CU13), but reads the caller when a Bearer token is present so
   * the response can carry `viewerPlanState` (CU22) without a second request.
   */
  @Get(':id')
  @UseGuards(OptionalAuthenticationGuard)
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @OptionalUser() user?: SessionUserDto,
  ) {
    return this.plansService.findOne(id, user?.id ?? null);
  }
}
