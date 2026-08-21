import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  createPaginatedResponse,
  PaginatedResponse,
} from '../common/pagination/paginated-response';
import { Category } from './entities/category.entity';
import { CategoryListQueryDto } from './dto/category-list-query.dto';

export interface CategoryListItemDto {
  id: number;
  name: string;
  description: string | null;
  status: { key: string; name: string };
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

    const direction = query.direction.toUpperCase() as 'ASC' | 'DESC';
    const [items, total] = await builder
      .orderBy('category.name', direction)
      .addOrderBy('category.id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return createPaginatedResponse(
      items.map((category) => ({
        id: category.id,
        name: category.name,
        description: category.description,
        status: { key: category.status.key, name: category.status.name },
      })),
      total,
      query.page,
      query.limit,
    );
  }
}
