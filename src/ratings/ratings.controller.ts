import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiController } from '../common/swagger/api-controller.decorator';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { CreateRatingDto } from './dto/create-rating.dto';
import { ListAdminRatingsQueryDto } from './dto/list-admin-ratings-query.dto';
import { ListRatingsQueryDto } from './dto/list-ratings-query.dto';
import { ModerateRatingDto } from './dto/moderate-rating.dto';
import { DeleteAdminRatingDto } from './dto/delete-admin-rating.dto';
import { UpdateRatingDto } from './dto/update-rating.dto';
import { RatingsService } from './ratings.service';

@ApiController({ tag: 'Ratings' })
@Controller()
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}

  @Public()
  @Get('activities/:activityId/ratings')
  listPublic(
    @Param('activityId', ParseIntPipe) activityId: number,
    @Query() query: ListRatingsQueryDto,
  ) {
    return this.ratings.listPublic(activityId, query);
  }

  @Permissions('rating.list')
  @ApiBearerAuth('access-token')
  @Get('activities/:activityId/ratings/me')
  findOwn(
    @Param('activityId', ParseIntPipe) activityId: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.ratings.findOwn(activityId, request.authentication.id);
  }

  @Permissions('rating.create')
  @ApiBearerAuth('access-token')
  @Post('activities/:activityId/ratings')
  create(
    @Param('activityId', ParseIntPipe) activityId: number,
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateRatingDto,
  ) {
    return this.ratings.create(activityId, request.authentication.id, dto);
  }

  @Permissions('rating.update')
  @ApiBearerAuth('access-token')
  @Patch('ratings/:id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateRatingDto,
  ) {
    return this.ratings.update(id, request.authentication.id, dto);
  }

  @Permissions('rating.delete')
  @ApiBearerAuth('access-token')
  @Delete('ratings/:id')
  @HttpCode(204)
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.ratings.remove(id, request.authentication.id);
  }

  @Permissions('rating.moderate')
  @Roles('admin')
  @ApiBearerAuth('access-token')
  @Get('admin/ratings')
  listAdmin(@Query() query: ListAdminRatingsQueryDto) {
    return this.ratings.listAdmin(query);
  }

  @Permissions('rating.moderate')
  @Roles('admin')
  @ApiBearerAuth('access-token')
  @Patch('admin/ratings/:id/moderation')
  moderate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModerateRatingDto,
  ) {
    return this.ratings.moderate(id, dto);
  }

  @Permissions('content.delete')
  @Roles('admin')
  @ApiBearerAuth('access-token')
  @Delete('admin/ratings/:id')
  @HttpCode(204)
  async removeByAdministrator(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
    @Body() dto: DeleteAdminRatingDto,
  ): Promise<void> {
    await this.ratings.removeByAdministrator(
      id,
      request.authentication.id,
      dto,
    );
  }
}
