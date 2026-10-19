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

  /** Public so a published plan's shared link opens without a session. */
  @Get(':id')
  @Public()
  @UseGuards(OptionalAuthenticationGuard)
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @OptionalUser() user?: SessionUserDto,
  ) {
    return this.plansService.findOne(id, user?.id ?? null);
  }
}
