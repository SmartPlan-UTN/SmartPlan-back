import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Permissions } from '../auth/decorators/permissions.decorator';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { PaginatedResponse } from '../common/pagination/paginated-response';
import { FavoriteActivityDto } from './dto/favorite-response.dto';
import { ListFavoriteActivitiesQueryDto } from './dto/list-favorite-activities-query.dto';
import { SaveFavoriteActivityDto } from './dto/save-favorite-activity.dto';
import { FavoritesService } from './favorites.service';

@Controller('favorite-activities')
export class FavoriteActivitiesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Permissions('favorite.list')
  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListFavoriteActivitiesQueryDto,
  ): Promise<PaginatedResponse<FavoriteActivityDto>> {
    return this.favorites.listActivities(request.authentication.id, query);
  }

  @Permissions('favorite.save')
  @Post()
  save(
    @Req() request: AuthenticatedRequest,
    @Body() dto: SaveFavoriteActivityDto,
  ): Promise<FavoriteActivityDto> {
    return this.favorites.saveActivity(request.authentication.id, dto);
  }

  @Permissions('favorite.remove')
  @Delete(':idActivity')
  @HttpCode(204)
  async remove(
    @Req() request: AuthenticatedRequest,
    @Param('idActivity', ParseIntPipe) idActivity: number,
  ): Promise<void> {
    await this.favorites.removeActivity(request.authentication.id, idActivity);
  }
}
