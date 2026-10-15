import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { SessionUserDto } from '../auth/dto/authentication-response.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OptionalUser } from '../auth/decorators/optional-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { OptionalAuthenticationGuard } from '../auth/guards/optional-authentication.guard';
import {
  ApiController,
  ErrorResponseDto,
} from '../common/swagger/api-controller.decorator';
import { PlanSearchQueryDto } from './dto/plan-search-query.dto';
import { PlansService } from './plans.service';

@ApiController({ tag: 'Plans' })
@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  @Public()
  @UseGuards(OptionalAuthenticationGuard)
  search(
    @Query() query: PlanSearchQueryDto,
    @OptionalUser() user?: SessionUserDto,
  ) {
    return this.plansService.search(query, user?.id ?? null);
  }

  @Get(':id')
  @ApiBearerAuth('access-token')
  @ApiUnauthorizedResponse({
    description: 'A valid access token is required.',
    type: ErrorResponseDto,
  })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: SessionUserDto,
  ) {
    return this.plansService.findOne(id, user.id);
  }
}
