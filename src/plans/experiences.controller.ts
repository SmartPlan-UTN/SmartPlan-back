import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse } from '@nestjs/swagger';
import type { SessionUserDto } from '../auth/dto/authentication-response.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PaginatedQueryDto } from '../common/pagination/paginated-query.dto';
import {
  ApiController,
  ErrorResponseDto,
} from '../common/swagger/api-controller.decorator';
import { ListAdminExperiencesQueryDto } from './dto/list-admin-experiences-query.dto';
import { ModerateExperienceContentDto } from './dto/moderate-experience-content.dto';
import { ExperiencesService } from './experiences.service';

/** Community experiences of published plans and their moderation (#106). */
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

  @Permissions('experience.moderate')
  @Roles('admin')
  @ApiBearerAuth('access-token')
  @Get('admin/experiences')
  listAdmin(@Query() query: ListAdminExperiencesQueryDto) {
    return this.experiences.listAdmin(query);
  }

  @Permissions('experience.moderate')
  @Roles('admin')
  @ApiBearerAuth('access-token')
  @Patch('admin/experiences/:id/comment')
  moderateComment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModerateExperienceContentDto,
  ) {
    return this.experiences.moderateComment(id, dto);
  }

  @Permissions('experience.moderate')
  @Roles('admin')
  @ApiBearerAuth('access-token')
  @Patch('admin/experiences/:id/photos/:imageId')
  moderatePhoto(
    @Param('id', ParseIntPipe) id: number,
    @Param('imageId', ParseIntPipe) imageId: number,
    @Body() dto: ModerateExperienceContentDto,
  ) {
    return this.experiences.moderatePhoto(id, imageId, dto);
  }
}
