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
import { ApiController } from '../common/swagger/api-controller.decorator';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { PaginatedResponse } from '../common/pagination/paginated-response';
import { FavoritePlanDto } from './dto/favorite-response.dto';
import { ListFavoritePlansQueryDto } from './dto/list-favorite-plans-query.dto';
import { SaveFavoritePlanDto } from './dto/save-favorite-plan.dto';
import { FavoritesService } from './favorites.service';

@ApiController({ tag: 'Favorite plans', authenticated: true })
@Controller('favorite-plans')
export class FavoritePlansController {
  constructor(private readonly favorites: FavoritesService) {}

  @Permissions('favorite.list')
  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListFavoritePlansQueryDto,
  ): Promise<PaginatedResponse<FavoritePlanDto>> {
    return this.favorites.listPlans(request.authentication.id, query);
  }

  @Permissions('favorite.save')
  @Post()
  save(
    @Req() request: AuthenticatedRequest,
    @Body() dto: SaveFavoritePlanDto,
  ): Promise<FavoritePlanDto> {
    return this.favorites.savePlan(request.authentication.id, dto);
  }

  @Permissions('favorite.remove')
  @Delete(':idPlan')
  @HttpCode(204)
  async remove(
    @Req() request: AuthenticatedRequest,
    @Param('idPlan', ParseIntPipe) idPlan: number,
  ): Promise<void> {
    await this.favorites.removePlan(request.authentication.id, idPlan);
  }
}
