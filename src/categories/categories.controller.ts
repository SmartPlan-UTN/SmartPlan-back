import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { CategoriesService } from './categories.service';
import { CategoryListQueryDto } from './dto/category-list-query.dto';

@Public()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findAll(@Query() query: CategoryListQueryDto) {
    return this.categoriesService.findAll(query);
  }
}
