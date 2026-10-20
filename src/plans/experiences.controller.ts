import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiNotFoundResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { SessionUserDto } from '../auth/dto/authentication-response.dto';
import { OptionalUser } from '../auth/decorators/optional-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { OptionalAuthenticationGuard } from '../auth/guards/optional-authentication.guard';
import { PaginatedQueryDto } from '../common/pagination/paginated-query.dto';
import {
  ApiController,
  ErrorResponseDto,
} from '../common/swagger/api-controller.decorator';
import { ExperiencesService } from './experiences.service';

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
export class ExperiencesController {
  constructor(private readonly experiences: ExperiencesService) {}

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
