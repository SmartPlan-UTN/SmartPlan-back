import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  ParseIntPipe,
  Query,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiNotFoundResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { OptionalUser } from '../auth/decorators/optional-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import type { SessionUserDto } from '../auth/dto/authentication-response.dto';
import { Public } from '../auth/decorators/public.decorator';
import { OptionalAuthenticationGuard } from '../auth/guards/optional-authentication.guard';
import { PaginatedQueryDto } from '../common/pagination/paginated-query.dto';
import {
  ApiController,
  ErrorResponseDto,
} from '../common/swagger/api-controller.decorator';
import { ExperiencesService } from './experiences.service';
import {
  CommunityFeedQueryDto,
  CommunityPlansQueryDto,
  CommunityQueryDto,
} from './dto/community-query.dto';

/**
 * Community experiences of published plans (#106). Public like the plan
 * detail, so a shared link shows them without a session.
 */
@ApiController({ tag: 'Experiences' })
@ApiUnauthorizedResponse({
  description:
    'Supplied credentials are invalid or expired; omit them for anonymous access.',
  type: ErrorResponseDto,
})
@Controller()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class ExperiencesController {
  constructor(private readonly experiences: ExperiencesService) {}

  @Get('community/feed')
  @Public()
  @UseGuards(OptionalAuthenticationGuard)
  listFeed(
    @Query() query: CommunityFeedQueryDto,
    @OptionalUser() user?: SessionUserDto,
  ) {
    return this.experiences.listFeed(query, user?.id ?? null);
  }

  @Get('community/experiences')
  @Public()
  @UseGuards(OptionalAuthenticationGuard)
  listCommunity(
    @Query() query: CommunityQueryDto,
    @OptionalUser() user?: SessionUserDto,
  ) {
    return this.experiences.listCommunity(query, user?.id ?? null);
  }

  @Get('community/plans')
  @Public()
  listCommunityPlans(@Query() query: CommunityPlansQueryDto) {
    return this.experiences.listCommunityPlans(query);
  }

  @Get('community/plans/:id/adaptations')
  @Public()
  listAdaptations(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: CommunityPlansQueryDto,
  ) {
    return this.experiences.listAdaptations(id, query);
  }

  @Get('community/experiences/:id')
  @Public()
  @UseGuards(OptionalAuthenticationGuard)
  findCommunityExperience(
    @Param('id', ParseIntPipe) id: number,
    @OptionalUser() user?: SessionUserDto,
  ) {
    return this.experiences.findCommunityExperience(id, user?.id ?? null);
  }

  @Put('community/experiences/:id/like')
  @Permissions('feedback.create')
  likeExperience(
    @CurrentUser() user: SessionUserDto,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.experiences.setExperienceLike(id, user.id, true);
  }

  @Delete('community/experiences/:id/like')
  @Permissions('feedback.create')
  unlikeExperience(
    @CurrentUser() user: SessionUserDto,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.experiences.setExperienceLike(id, user.id, false);
  }

  @Post('community/experiences/:id/visits')
  @Permissions('feedback.create')
  addExperienceVisit(
    @CurrentUser() user: SessionUserDto,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.experiences.addCommunityExperienceVisit(id, user.id);
  }

  @Get('community/creators')
  @Public()
  listCreators() {
    return this.experiences.listCreators(8);
  }

  @Get('community/creators/:username')
  @Public()
  getCreator(@Param('username') username: string) {
    return this.experiences.getCreator(username);
  }

  @Get('community/creators/:username/experiences')
  @Public()
  @UseGuards(OptionalAuthenticationGuard)
  listCreatorExperiences(
    @Param('username') username: string,
    @Query() query: CommunityQueryDto,
    @OptionalUser() user?: SessionUserDto,
  ) {
    return this.experiences.listCommunity(query, user?.id ?? null, username);
  }

  @Get('community/creators/:username/plans')
  @Public()
  listCreatorPlans(
    @Param('username') username: string,
    @Query() query: CommunityPlansQueryDto,
  ) {
    return this.experiences.listCreatorPlans(username, query);
  }

  @Get('community/creators/:username/inspired')
  @Public()
  listInspired(
    @Param('username') username: string,
    @Query() query: CommunityPlansQueryDto,
  ) {
    return this.experiences.listInspired(username, query);
  }

  @Get('plans/:id/experiences')
  @Public()
  @UseGuards(OptionalAuthenticationGuard)
  @ApiNotFoundResponse({
    description: 'The plan does not exist or the viewer may not read it.',
    type: ErrorResponseDto,
  })
  listForPlan(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: PaginatedQueryDto,
    @OptionalUser() user?: SessionUserDto,
  ) {
    return this.experiences.listForPlan(id, user?.id ?? null, query);
  }
}
