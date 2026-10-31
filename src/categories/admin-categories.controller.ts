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
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { ApiController } from '../common/swagger/api-controller.decorator';
import { AdminCategoriesService } from './admin-categories.service';
import {
  CreateAdminCategoryDto,
  UpdateAdminCategoryDto,
} from './dto/admin-category.dto';
import { ListAdminCategoriesQueryDto } from './dto/admin-category-list-query.dto';

@Roles('admin')
@ApiController({ tag: 'Administration', authenticated: true })
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(private readonly categories: AdminCategoriesService) {}

  @Permissions('category.list')
  @Get()
  findAll(@Query() query: ListAdminCategoriesQueryDto) {
    return this.categories.findAll(query);
  }

  @Permissions('category.create')
  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateAdminCategoryDto,
  ) {
    return this.categories.create(request.authentication.id, dto);
  }

  @Permissions('category.update')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateAdminCategoryDto,
  ) {
    return this.categories.update(request.authentication.id, id, dto);
  }

  @Permissions('category.delete')
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.categories.remove(request.authentication.id, id);
  }
}
