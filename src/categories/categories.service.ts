import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  createPaginatedResponse,
  PaginatedResponse,
} from '../common/pagination/paginated-response';
import { Category } from './entities/category.entity';
import {
  CategoryListQueryDto,
  CategorySortField,
} from './dto/category-list-query.dto';

export interface CategoryListItemDto {
  id: number;
  name: string;
  description: string | null;
}

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
  ) {}

  async findAll(
    query: CategoryListQueryDto,
  ): Promise<PaginatedResponse<CategoryListItemDto>> {
    const builder = this.categories
      .createQueryBuilder('category')
      .innerJoinAndSelect('category.status', 'status')
      .where('category.deletedAt IS NULL')
      .andWhere('status.key = :activeStatus', { activeStatus: 'active' });

    if (query.search) {
      builder.andWhere(
        '(category.name ILIKE :search OR category.description ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    const sortBy = query.sortBy ?? CategorySortField.NAME;
    const direction = query.direction.toUpperCase() as 'ASC' | 'DESC';
    const sortColumns: Record<CategorySortField, string> = {
      [CategorySortField.NAME]: 'category.name',
    };
    const [items, total] = await builder
      .orderBy(sortColumns[sortBy], direction)
      .addOrderBy('category.id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return createPaginatedResponse(
      items.map((category) => ({
        id: category.id,
        name: category.name,
        description: category.description,
      })),
      total,
      query.page,
      query.limit,
    );
  }
}
