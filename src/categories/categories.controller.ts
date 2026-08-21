import { Controller, Get, Query } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CategoryListQueryDto } from './dto/category-list-query.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findAll(@Query() query: CategoryListQueryDto) {
    return this.categoriesService.findAll(query);
  }
}
