import {
  ConflictException,
  Injectable,
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
import { Plan } from '../plans/entities/plan.entity';
import { PlanDetail } from '../plans/entities/plan-detail.entity';
import {
  FavoriteActivityDto,
  FavoriteActivitySummaryDto,
  FavoritePlanDto,
  FavoritePlanSummaryDto,
} from './dto/favorite-response.dto';
import {
  FavoriteActivitySortField,
  ListFavoriteActivitiesQueryDto,
} from './dto/list-favorite-activities-query.dto';
import {
  FavoritePlanSortField,
  ListFavoritePlansQueryDto,
} from './dto/list-favorite-plans-query.dto';
import { SaveFavoriteActivityDto } from './dto/save-favorite-activity.dto';
import { SaveFavoritePlanDto } from './dto/save-favorite-plan.dto';
import { FavoriteActivity } from './entities/favorite-activity.entity';
import { FavoriteList } from './entities/favorite-list.entity';
import { FavoritePlan } from './entities/favorite-plan.entity';

interface PlanActivityCountRow {
  idPlan: string;
  activityCount: string;
}

/**
 * Every user owns a single `favorite_list`, created the first time something is
 * saved. Removing a favorite soft-removes the membership row only: the saved
 * activity or plan is never touched (CU41, CU42).
 */
@Injectable()
export class FavoritesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(FavoriteActivity)
    private readonly favoriteActivities: Repository<FavoriteActivity>,
    @InjectRepository(FavoritePlan)
    private readonly favoritePlans: Repository<FavoritePlan>,
    @InjectRepository(FavoriteList)
    private readonly lists: Repository<FavoriteList>,
  ) {}

  async listActivities(
    idUser: number,
    query: ListFavoriteActivitiesQueryDto,
  ): Promise<PaginatedResponse<FavoriteActivityDto>> {
    const list = await this.lists.findOne({ where: { idUser } });
    if (!list) {
      return createPaginatedResponse([], 0, query.page, query.limit);
    }

    const sortBy = query.sortBy ?? FavoriteActivitySortField.SAVED_AT;
    const sortColumns: Record<FavoriteActivitySortField, string> = {
      [FavoriteActivitySortField.SAVED_AT]: 'favorite.createdAt',
      [FavoriteActivitySortField.NAME]: 'activity.name',
      [FavoriteActivitySortField.ESTIMATED_COST]: 'activity.estimatedCost',
    };
    const [favorites, total] = await this.favoriteActivities
      .createQueryBuilder('favorite')
      .innerJoinAndSelect('favorite.activity', 'activity')
      .where('favorite.idFavoriteList = :idFavoriteList', {
        idFavoriteList: list.id,
      })
      .orderBy(sortColumns[sortBy], this.toSqlDirection(query.direction))
      .addOrderBy('favorite.id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return createPaginatedResponse(
      favorites.map((favorite) => this.toFavoriteActivity(favorite)),
      total,
      query.page,
      query.limit,
    );
  }

  async listPlans(
    idUser: number,
    query: ListFavoritePlansQueryDto,
  ): Promise<PaginatedResponse<FavoritePlanDto>> {
    const list = await this.lists.findOne({ where: { idUser } });
    if (!list) {
      return createPaginatedResponse([], 0, query.page, query.limit);
    }

    const sortBy = query.sortBy ?? FavoritePlanSortField.SAVED_AT;
    const sortColumns: Record<FavoritePlanSortField, string> = {
      [FavoritePlanSortField.SAVED_AT]: 'favorite.createdAt',
      [FavoritePlanSortField.TITLE]: 'plan.title',
      [FavoritePlanSortField.ESTIMATED_TOTAL_COST]: 'plan.estimatedTotalCost',
    };
    const [favorites, total] = await this.favoritePlans
      .createQueryBuilder('favorite')
      .innerJoinAndSelect('favorite.plan', 'plan')
      .innerJoinAndSelect('plan.status', 'status')
      .where('favorite.idFavoriteList = :idFavoriteList', {
        idFavoriteList: list.id,
      })
      .orderBy(sortColumns[sortBy], this.toSqlDirection(query.direction))
      .addOrderBy('favorite.id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    const activityCounts = await this.countPlanActivities(
      favorites.map((favorite) => favorite.idPlan),
    );

    return createPaginatedResponse(
      favorites.map((favorite) =>
        this.toFavoritePlan(favorite, activityCounts.get(favorite.idPlan) ?? 0),
      ),
      total,
      query.page,
      query.limit,
    );
  }

  async saveActivity(
    idUser: number,
    dto: SaveFavoriteActivityDto,
  ): Promise<FavoriteActivityDto> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const activity = await manager.findOne(Activity, {
          where: { id: dto.idActivity },
        });
        if (!activity) {
          throw new NotFoundException({
            code: 'ACTIVITY_NOT_FOUND',
            message: 'The requested activity does not exist',
          });
        }

        const list = await this.resolveList(idUser, manager);
        const favorite = await manager.save(
          manager.create(FavoriteActivity, {
            idFavoriteList: list.id,
            idActivity: activity.id,
          }),
        );
        favorite.activity = activity;
        return this.toFavoriteActivity(favorite);
      });
    } catch (error) {
      this.rethrowUniqueViolation(error, {
        code: 'ACTIVITY_ALREADY_IN_FAVORITES',
        message: 'The activity is already saved in favorites',
      });
    }
  }

  async savePlan(
    idUser: number,
    dto: SaveFavoritePlanDto,
  ): Promise<FavoritePlanDto> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const plan = await manager.findOne(Plan, {
          where: { id: dto.idPlan },
          relations: { status: true },
        });
        if (!plan) {
          throw new NotFoundException({
            code: 'PLAN_NOT_FOUND',
            message: 'The requested plan does not exist',
          });
        }

        const list = await this.resolveList(idUser, manager);
        const favorite = await manager.save(
          manager.create(FavoritePlan, {
            idFavoriteList: list.id,
            idPlan: plan.id,
          }),
        );
        favorite.plan = plan;
        const counts = await this.countPlanActivities([plan.id], manager);
        return this.toFavoritePlan(favorite, counts.get(plan.id) ?? 0);
      });
    } catch (error) {
      this.rethrowUniqueViolation(error, {
        code: 'PLAN_ALREADY_IN_FAVORITES',
        message: 'The plan is already saved in favorites',
      });
    }
  }

  async removeActivity(idUser: number, idActivity: number): Promise<void> {
    const list = await this.lists.findOne({ where: { idUser } });
    const favorite = list
      ? await this.favoriteActivities.findOne({
          where: { idFavoriteList: list.id, idActivity },
        })
      : null;
    if (!favorite) {
      throw new NotFoundException({
        code: 'FAVORITE_ACTIVITY_NOT_FOUND',
        message: 'The activity is not saved in favorites',
      });
    }
    await this.favoriteActivities.softRemove(favorite);
  }

  async removePlan(idUser: number, idPlan: number): Promise<void> {
    const list = await this.lists.findOne({ where: { idUser } });
    const favorite = list
      ? await this.favoritePlans.findOne({
          where: { idFavoriteList: list.id, idPlan },
        })
      : null;
    if (!favorite) {
      throw new NotFoundException({
        code: 'FAVORITE_PLAN_NOT_FOUND',
        message: 'The plan is not saved in favorites',
      });
    }
    await this.favoritePlans.softRemove(favorite);
  }

  /**
   * `ON CONFLICT DO NOTHING` instead of catching a unique violation: a failed
   * insert aborts the surrounding transaction, so the list could not be read
   * back when two first saves of the same user race each other.
   */
  private async resolveList(
    idUser: number,
    manager: EntityManager,
  ): Promise<FavoriteList> {
    await manager
      .createQueryBuilder()
      .insert()
      .into(FavoriteList)
      .values({ idUser })
      .orIgnore()
      .execute();
    const list = await manager.findOne(FavoriteList, { where: { idUser } });
    if (!list) {
      throw new NotFoundException({
        code: 'FAVORITE_LIST_NOT_FOUND',
        message: 'The favorites list of the user does not exist',
      });
    }
    return list;
  }

  private async countPlanActivities(
    idPlans: number[],
    manager?: EntityManager,
  ): Promise<Map<number, number>> {
    if (idPlans.length === 0) return new Map();

    const repository = manager
      ? manager.getRepository(PlanDetail)
      : this.dataSource.getRepository(PlanDetail);
    const rows = await repository
      .createQueryBuilder('detail')
      .select('detail.id_plan', 'idPlan')
      .addSelect('COUNT(*)', 'activityCount')
      .where('detail.id_plan IN (:...idPlans)', { idPlans })
      .groupBy('detail.id_plan')
      .getRawMany<PlanActivityCountRow>();

    return new Map(
      rows.map((row) => [Number(row.idPlan), Number(row.activityCount)]),
    );
  }

  private toSqlDirection(direction: string): 'ASC' | 'DESC' {
    return direction.toUpperCase() as 'ASC' | 'DESC';
  }

  private toFavoriteActivity(favorite: FavoriteActivity): FavoriteActivityDto {
    return {
      id: favorite.id,
      idActivity: favorite.idActivity,
      savedAt: favorite.createdAt,
      activity: this.toActivitySummary(favorite.activity),
    };
  }

  private toActivitySummary(activity: Activity): FavoriteActivitySummaryDto {
    return {
      id: activity.id,
      name: activity.name,
      description: activity.description,
      estimatedCost: activity.estimatedCost,
      estimatedDuration: activity.estimatedDuration,
      type: activity.type,
    };
  }

  private toFavoritePlan(
    favorite: FavoritePlan,
    activityCount: number,
  ): FavoritePlanDto {
    return {
      id: favorite.id,
      idPlan: favorite.idPlan,
      savedAt: favorite.createdAt,
      plan: this.toPlanSummary(favorite.plan, activityCount),
    };
  }

  private toPlanSummary(
    plan: Plan,
    activityCount: number,
  ): FavoritePlanSummaryDto {
    return {
      id: plan.id,
      title: plan.title,
      description: plan.description,
      estimatedTotalCost: plan.estimatedTotalCost,
      estimatedTotalDuration: plan.estimatedTotalDuration,
      peopleCount: plan.peopleCount,
      activityCount,
      status: { key: plan.status.key, name: plan.status.name },
    };
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
