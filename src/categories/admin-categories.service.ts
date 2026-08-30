import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { ActivityCategory } from '../activities/entities/activity-category.entity';
import { AuditService } from '../common/audit/audit.service';
import {
  createPaginatedResponse,
  PaginatedResponse,
} from '../common/pagination/paginated-response';
import { PlanRequestCategory } from '../recommendation/entities/plan-request-category.entity';
import { UserPreference } from '../users/entities/user-preference.entity';
import {
  CategoryStatusKey,
  CreateAdminCategoryDto,
  UpdateAdminCategoryDto,
} from './dto/admin-category.dto';
import {
  AdminCategorySortField,
  ListAdminCategoriesQueryDto,
} from './dto/admin-category-list-query.dto';
import { AdminCategoryDto } from './dto/admin-category-response.dto';
import { Category } from './entities/category.entity';
import { CategoryStatus } from './entities/category-status.entity';
import { AuditAction } from '../administration/entities/audit-log.entity';

@Injectable()
export class AdminCategoriesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    private readonly auditService: AuditService,
  ) {}

  async findAll(
    query: ListAdminCategoriesQueryDto,
  ): Promise<PaginatedResponse<AdminCategoryDto>> {
    const builder = this.categories
      .createQueryBuilder('category')
      .innerJoinAndSelect('category.status', 'status');
    if (query.search) {
      builder.andWhere(
        '(category.name ILIKE :search OR category.description ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.status) {
      builder.andWhere('status.key = :status', { status: query.status });
    }
    this.applyOrdering(builder, query);
    const [categories, total] = await builder
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return createPaginatedResponse(
      categories.map((category) => this.toResponse(category)),
      total,
      query.page,
      query.limit,
    );
  }

  async create(dto: CreateAdminCategoryDto): Promise<AdminCategoryDto> {
    return this.dataSource.transaction(async (manager) => {
      await this.assertNameAvailable(manager, dto.name);
      const status = await this.requireStatus(
        manager,
        CategoryStatusKey.ACTIVE,
      );
      const category = await manager.save(
        manager.create(Category, {
          name: dto.name,
          description: dto.description ?? null,
          idCategoryStatus: status.id,
          status,
        }),
      );
      await this.auditService.record(
        manager,
        AuditAction.Create,
        'category',
        category.id,
        {
          name: category.name,
          status: status.key,
        },
      );
      return this.toResponse(category);
    });
  }

  async update(
    id: number,
    dto: UpdateAdminCategoryDto,
  ): Promise<AdminCategoryDto> {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException({
        code: 'CATEGORY_UPDATE_EMPTY',
        message: 'At least one category field must be provided',
      });
    }
    return this.dataSource.transaction(async (manager) => {
      const category = await manager.findOne(Category, {
        where: { id },
        relations: { status: true },
      });
      if (!category) this.throwNotFound();

      const original = {
        name: category.name,
        description: category.description,
        status: category.status.key,
      };
      if (dto.name !== undefined && dto.name !== category.name) {
        await this.assertNameAvailable(manager, dto.name, id);
        category.name = dto.name;
      }
      if (dto.description !== undefined) category.description = dto.description;
      if (
        dto.status !== undefined &&
        dto.status !== (category.status.key as CategoryStatusKey)
      ) {
        const status = await this.requireStatus(manager, dto.status);
        category.idCategoryStatus = status.id;
        category.status = status;
      }
      await manager.save(category);
      await this.auditService.record(
        manager,
        AuditAction.Update,
        'category',
        id,
        {
          original,
          current: {
            name: category.name,
            description: category.description,
            status: category.status.key,
          },
        },
      );
      return this.toResponse(category);
    });
  }

  async remove(id: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const category = await manager.findOne(Category, { where: { id } });
      if (!category) this.throwNotFound();
      const [activityCount, preferenceCount, requestCount] = await Promise.all([
        manager.count(ActivityCategory, { where: { idCategory: id } }),
        manager.count(UserPreference, { where: { idCategory: id } }),
        manager.count(PlanRequestCategory, { where: { idCategory: id } }),
      ]);
      if (activityCount + preferenceCount + requestCount > 0) {
        throw new ConflictException({
          code: 'CATEGORY_IN_USE',
          message: 'The category cannot be deleted while it is in use',
        });
      }
      await manager.softRemove(category);
      await this.auditService.record(
        manager,
        AuditAction.Delete,
        'category',
        id,
        {
          name: category.name,
        },
      );
    });
  }

  private applyOrdering(
    builder: SelectQueryBuilder<Category>,
    query: ListAdminCategoriesQueryDto,
  ): void {
    const columns: Record<AdminCategorySortField, string> = {
      [AdminCategorySortField.CREATED_AT]: 'category.createdAt',
      [AdminCategorySortField.NAME]: 'category.name',
      [AdminCategorySortField.STATUS]: 'status.key',
    };
    const field = query.sortBy ?? AdminCategorySortField.CREATED_AT;
    builder
      .orderBy(columns[field], query.direction.toUpperCase() as 'ASC' | 'DESC')
      .addOrderBy('category.id', 'ASC');
  }

  private async assertNameAvailable(
    manager: EntityManager,
    name: string,
    categoryId?: number,
  ): Promise<void> {
    const builder = manager
      .getRepository(Category)
      .createQueryBuilder('category')
      .where('LOWER(category.name) = LOWER(:name)', { name });
    if (categoryId !== undefined) {
      builder.andWhere('category.id != :categoryId', { categoryId });
    }
    if (await builder.getExists()) {
      throw new ConflictException({
        code: 'CATEGORY_NAME_ALREADY_EXISTS',
        message: 'A category with this name already exists',
      });
    }
  }

  private async requireStatus(
    manager: EntityManager,
    key: CategoryStatusKey,
  ): Promise<CategoryStatus> {
    const status = await manager.findOne(CategoryStatus, { where: { key } });
    if (!status) {
      throw new NotFoundException({
        code: 'CATEGORY_STATUS_NOT_AVAILABLE',
        message: 'The requested category status is not available',
      });
    }
    return status;
  }

  private toResponse(category: Category): AdminCategoryDto {
    return {
      id: category.id,
      name: category.name,
      description: category.description,
      status: {
        key: category.status.key as CategoryStatusKey,
        name: category.status.name,
      },
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }

  private throwNotFound(): never {
    throw new NotFoundException({
      code: 'CATEGORY_NOT_FOUND',
      message: 'The requested category does not exist',
    });
  }
}
