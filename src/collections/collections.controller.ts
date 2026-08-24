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
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { CollectionsService } from './collections.service';
import { AddCollectionActivityDto } from './dto/add-collection-activity.dto';
import { CollectionDetailDto } from './dto/collection-response.dto';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { ListCollectionsQueryDto } from './dto/list-collections-query.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';

@Controller('collections')
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @Permissions('collection.list')
  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListCollectionsQueryDto,
  ) {
    return this.collections.list(request.authentication.id, query);
  }

  @Permissions('collection.create')
  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateCollectionDto,
  ): Promise<CollectionDetailDto> {
    return this.collections.create(request.authentication.id, dto);
  }

  @Permissions('collection.view')
  @Get(':id')
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CollectionDetailDto> {
    return this.collections.findOne(request.authentication.id, id);
  }

  @Permissions('collection.update')
  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCollectionDto,
  ): Promise<CollectionDetailDto> {
    return this.collections.update(request.authentication.id, id, dto);
  }

  @Permissions('collection.delete')
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.collections.remove(request.authentication.id, id);
  }

  @Permissions('collection.update')
  @Post(':id/activities')
  addActivity(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddCollectionActivityDto,
  ): Promise<CollectionDetailDto> {
    return this.collections.addActivity(request.authentication.id, id, dto);
  }

  @Permissions('collection.update')
  @Delete(':id/activities/:idActivity')
  @HttpCode(204)
  async removeActivity(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('idActivity', ParseIntPipe) idActivity: number,
  ): Promise<void> {
    await this.collections.removeActivity(
      request.authentication.id,
      id,
      idActivity,
    );
  }
}
