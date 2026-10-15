import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiNotFoundResponse } from '@nestjs/swagger';
import type { SessionUserDto } from '../auth/dto/authentication-response.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PaginatedQueryDto } from '../common/pagination/paginated-query.dto';
import {
  ApiController,
  ErrorResponseDto,
} from '../common/swagger/api-controller.decorator';
import { ExperiencesService } from './experiences.service';

/** Community experiences of published plans (#106). */
@ApiController({ tag: 'Experiences', authenticated: true })
@Controller()
export class ExperiencesController {
  constructor(private readonly experiences: ExperiencesService) {}

  @Get('plans/:id/experiences')
  @ApiNotFoundResponse({
    description: 'The plan does not exist or the viewer may not read it.',
    type: ErrorResponseDto,
  })
  listForPlan(
    @CurrentUser() user: SessionUserDto,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: PaginatedQueryDto,
  ) {
    return this.experiences.listForPlan(id, user.id, query);
  }
}
