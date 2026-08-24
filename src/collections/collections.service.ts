import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { Activity } from '../activities/entities/activity.entity';
import {
  createPaginatedResponse,
  PaginatedResponse,
} from '../common/pagination/paginated-response';
import { AddCollectionActivityDto } from './dto/add-collection-activity.dto';
import {
  CollectionDetailDto,
  CollectionSummaryDto,
} from './dto/collection-response.dto';
import { CreateCollectionDto } from './dto/create-collection.dto';
import {
  CollectionSortField,
  ListCollectionsQueryDto,
} from './dto/list-collections-query.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';
import { Collection } from './entities/collection.entity';
import { FavoriteCollection } from './entities/favorite-collection.entity';

interface CollectionListRow {
  activityCount: string;
}

@Injectable()
export class CollectionsService {
  private readonly logger = new Logger(CollectionsService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Collection)
    private readonly collections: Repository<Collection>,
  ) {}

  async list(
    idUser: number,
    query: ListCollectionsQueryDto,
  ): Promise<PaginatedResponse<CollectionSummaryDto>> {
    const sortBy = query.sortBy ?? CollectionSortField.SAVED_AT;
    const direction = query.direction.toUpperCase() as 'ASC' | 'DESC';
    const sortColumns: Record<CollectionSortField, string> = {
      [CollectionSortField.NAME_COLLECTION]: 'collection.nameCollection',
      [CollectionSortField.SAVED_AT]: 'collection.savedAt',
    };
    const builder = this.collections
      .createQueryBuilder('collection')
      .addSelect(
        (subquery) =>
          subquery
            .select('COUNT(*)')
            .from(FavoriteCollection, 'favorite')
            .where('favorite.idCollection = collection.id')
            .andWhere('favorite.deletedAt IS NULL'),
        'activityCount',
      )
      .where('collection.idUser = :idUser', { idUser })
      .orderBy(sortColumns[sortBy], direction)
      .addOrderBy('collection.id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    const total = await builder.getCount();
    const { entities, raw } =
      await builder.getRawAndEntities<CollectionListRow>();

    return createPaginatedResponse(
      entities.map((collection, index) =>
        this.toSummary(collection, Number(raw[index]?.activityCount ?? 0)),
      ),
      total,
      query.page,
      query.limit,
    );
  }

  async create(
    idUser: number,
    dto: CreateCollectionDto,
  ): Promise<CollectionDetailDto> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const collection = await manager.save(
          manager.create(Collection, {
            idUser,
            nameCollection: dto.nameCollection,
            savedAt: new Date(),
          }),
        );
        return this.toDetail(
          await this.findOwnCollection(idUser, collection.id, manager),
        );
      });
    } catch (error) {
      this.rethrowUniqueViolation(error, {
        code: 'COLLECTION_NAME_ALREADY_EXISTS',
        message: 'A collection with this name already exists',
      });
    }
  }

  async findOne(idUser: number, id: number): Promise<CollectionDetailDto> {
    return this.toDetail(await this.findOwnCollection(idUser, id));
  }

  async update(
    idUser: number,
    id: number,
    dto: UpdateCollectionDto,
  ): Promise<CollectionDetailDto> {
    const nameCollection = dto.nameCollection;
    if (nameCollection === undefined) {
      throw new BadRequestException({
        code: 'COLLECTION_UPDATE_EMPTY',
        message: 'At least one collection field must be provided',
      });
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        const collection = await this.findOwnCollection(idUser, id, manager);
        collection.nameCollection = nameCollection;
        await manager.save(collection);
        return this.toDetail(await this.findOwnCollection(idUser, id, manager));
      });
    } catch (error) {
      this.rethrowUniqueViolation(error, {
        code: 'COLLECTION_NAME_ALREADY_EXISTS',
        message: 'A collection with this name already exists',
      });
    }
  }

  async remove(idUser: number, id: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const collection = await this.findOwnCollection(idUser, id, manager);
      if (collection.activities.length > 0) {
        await manager.softRemove(collection.activities);
      }
      await manager.softRemove(collection);
    });
  }

  async addActivity(
    idUser: number,
    id: number,
    dto: AddCollectionActivityDto,
  ): Promise<CollectionDetailDto> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.findOwnCollection(idUser, id, manager);
        const activity = await manager.findOne(Activity, {
          where: { id: dto.idActivity },
        });
        if (!activity) this.throwActivityNotFound();

        await manager.save(
          manager.create(FavoriteCollection, {
            idCollection: id,
            idActivity: dto.idActivity,
            order: null,
          }),
        );
        return this.toDetail(await this.findOwnCollection(idUser, id, manager));
      });
    } catch (error) {
      this.rethrowUniqueViolation(error, {
        code: 'ACTIVITY_ALREADY_IN_COLLECTION',
        message: 'The activity is already included in this collection',
      });
    }
  }

  async removeActivity(
    idUser: number,
    id: number,
    idActivity: number,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.findOwnCollection(idUser, id, manager);
      const favorite = await manager.findOne(FavoriteCollection, {
        where: { idCollection: id, idActivity },
      });
      if (!favorite) {
        throw new NotFoundException({
          code: 'COLLECTION_ACTIVITY_NOT_FOUND',
          message: 'The activity is not included in this collection',
        });
      }
      await manager.softRemove(favorite);
    });
  }

  private async findOwnCollection(
    idUser: number,
    id: number,
    manager?: EntityManager,
  ): Promise<Collection> {
    const repository = manager
      ? manager.getRepository(Collection)
      : this.collections;
    const collection = await repository.findOne({
      where: { id, idUser },
      relations: { activities: { activity: true } },
    });
    if (!collection) {
      throw new NotFoundException({
        code: 'COLLECTION_NOT_FOUND',
        message: 'The requested collection does not exist',
      });
    }
    return collection;
  }

  private toSummary(
    collection: Collection,
    activityCount: number,
  ): CollectionSummaryDto {
    return {
      id: collection.id,
      nameCollection: collection.nameCollection,
      savedAt: collection.savedAt,
      activityCount,
      createdAt: collection.createdAt,
      updatedAt: collection.updatedAt,
    };
  }

  private toDetail(collection: Collection): CollectionDetailDto {
    const activities = this.withKnownActivity(collection).sort(
      (left, right) =>
        (left.order ?? Number.MAX_SAFE_INTEGER) -
          (right.order ?? Number.MAX_SAFE_INTEGER) || left.id - right.id,
    );
    return {
      ...this.toSummary(collection, activities.length),
      activities: activities.map((favorite) => ({
        id: favorite.id,
        idCollection: favorite.idCollection,
        idActivity: favorite.idActivity,
        order: favorite.order,
        activity: {
          id: favorite.activity.id,
          name: favorite.activity.name,
          description: favorite.activity.description,
          estimatedCost: favorite.activity.estimatedCost,
          estimatedDuration: favorite.activity.estimatedDuration,
          type: favorite.activity.type,
        },
      })),
    };
  }

  private withKnownActivity(collection: Collection): FavoriteCollection[] {
    return collection.activities.filter((favorite) => {
      if (favorite.activity) return true;
      this.logger.warn(
        `Collection ${collection.id} keeps membership ${favorite.id} pointing at a missing activity ${favorite.idActivity}`,
      );
      return false;
    });
  }

  private throwActivityNotFound(): never {
    throw new NotFoundException({
      code: 'ACTIVITY_NOT_FOUND',
      message: 'The requested activity does not exist',
    });
  }

  private rethrowUniqueViolation(
    error: unknown,
    response: { code: string; message: string },
  ): never {
    if (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string }).code === '23505'
    ) {
      throw new ConflictException(response);
    }
    throw error;
  }
}
