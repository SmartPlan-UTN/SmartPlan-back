import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
  createPaginatedResponse,
  PaginatedResponse,
} from '../common/pagination/paginated-response';
import { validateExplorationQuery } from '../common/search/exploration-query.validation';
import { Plan } from './entities/plan.entity';
import { PlanDetailResponseDto, PlanSummaryDto } from './dto/plan-response.dto';
import { PlanSearchQueryDto, PlanSortField } from './dto/plan-search-query.dto';
import {
  PLAN_ACTIVITY_COUNT_SQL,
  PLAN_AVERAGE_RATING_SQL,
  PLAN_CATEGORY_JSON_SQL,
  PLAN_DISTANCE_SQL,
  PlanSummaryRow,
} from './plan-summary.sql';

@Injectable()
export class PlansService {
  constructor(
    @InjectRepository(Plan)
    private readonly plans: Repository<Plan>,
  ) {}

  async search(
    query: PlanSearchQueryDto,
  ): Promise<PaginatedResponse<PlanSummaryDto>> {
    const sortBy = query.sortBy ?? PlanSortField.RELEVANCE;
    validateExplorationQuery(query, sortBy === PlanSortField.DISTANCE);

    const builder = this.createSearchBuilder(query);
    const total = await builder.getCount();
    this.applyOrdering(builder, query, sortBy);

    const rows = await builder
      .offset((query.page - 1) * query.limit)
      .limit(query.limit)
      .getRawMany<PlanSummaryRow>();

    return createPaginatedResponse(
      rows.map((row) => this.mapSummary(row)),
      total,
      query.page,
      query.limit,
    );
  }

  async findOne(id: number): Promise<PlanDetailResponseDto> {
    const plan = await this.plans.findOne({
      where: { id },
      relations: {
        status: true,
        details: {
          activity: {
            categories: { category: { status: true } },
            places: {
              place: { department: { city: { country: true } } },
            },
            ratings: true,
          },
        },
      },
    });

    if (!plan || plan.status.key === 'cancelled') {
      throw new NotFoundException({
        code: 'PLAN_NOT_FOUND',
        message: 'El plan solicitado no existe',
      });
    }

    const details = [...plan.details]
      .sort((left, right) => left.order - right.order)
      .map((detail) => {
        const scores = detail.activity.ratings.map((rating) => rating.score);
        const averageRating =
          scores.length === 0
            ? 0
            : scores.reduce((total, score) => total + score, 0) / scores.length;

        return {
          id: detail.id,
          order: detail.order,
          estimatedCost: detail.estimatedCost,
          estimatedDuration: detail.estimatedDuration,
          activity: {
            id: detail.activity.id,
            name: detail.activity.name,
            description: detail.activity.description,
            estimatedCost: detail.activity.estimatedCost,
            estimatedDuration: detail.activity.estimatedDuration,
            type: detail.activity.type,
            averageRating: this.round(averageRating),
            ratingCount: scores.length,
            categories: detail.activity.categories
              .filter(({ category }) => category.status.key === 'active')
              .map(({ category }) => ({
                id: category.id,
                name: category.name,
              }))
              .sort((left, right) => left.name.localeCompare(right.name)),
            locations: detail.activity.places.map((location) => ({
              id: location.id,
              latitude: location.latitude,
              longitude: location.longitude,
              notes: location.notes,
              place: {
                id: location.place.id,
                name: location.place.name,
                description: location.place.description,
                address: location.place.address,
                department: {
                  id: location.place.department.id,
                  name: location.place.department.name,
                  city: {
                    id: location.place.department.city.id,
                    name: location.place.department.city.name,
                    country: {
                      id: location.place.department.city.country.id,
                      name: location.place.department.city.country.name,
                    },
                  },
                },
              },
            })),
          },
        };
      });

    const allScores = plan.details.flatMap((detail) =>
      detail.activity.ratings.map((rating) => rating.score),
    );
    const averageRating =
      allScores.length === 0
        ? 0
        : allScores.reduce((total, score) => total + score, 0) /
          allScores.length;
    const categoryMap = new Map<number, string>();
    plan.details.forEach((detail) =>
      detail.activity.categories
        .filter(({ category }) => category.status.key === 'active')
        .forEach(({ category }) => categoryMap.set(category.id, category.name)),
    );

    return {
      id: plan.id,
      title: plan.title,
      description: plan.description,
      estimatedTotalCost: plan.estimatedTotalCost,
      estimatedTotalDuration: plan.estimatedTotalDuration,
      activityCount: details.length,
      averageRating: this.round(averageRating),
      distanceKm: null,
      categories: [...categoryMap.entries()]
        .map(([categoryId, name]) => ({ id: categoryId, name }))
        .sort((left, right) => left.name.localeCompare(right.name)),
      status: { key: plan.status.key, name: plan.status.name },
      details,
    };
  }

  private createSearchBuilder(
    query: PlanSearchQueryDto,
  ): SelectQueryBuilder<Plan> {
    const builder = this.plans
      .createQueryBuilder('plan')
      .innerJoin('plan.status', 'status')
      .select('plan.id', 'id')
      .addSelect('plan.title', 'title')
      .addSelect('plan.description', 'description')
      .addSelect('plan.estimatedTotalCost', 'estimatedTotalCost')
      .addSelect('plan.estimatedTotalDuration', 'estimatedTotalDuration')
      .addSelect(PLAN_ACTIVITY_COUNT_SQL, 'activityCount')
      .addSelect(PLAN_AVERAGE_RATING_SQL, 'averageRating')
      .addSelect(PLAN_CATEGORY_JSON_SQL, 'categories')
      .addSelect('status.key', 'statusKey')
      .addSelect('status.name', 'statusName')
      .where('plan.deletedAt IS NULL')
      .andWhere('status.key <> :cancelledStatus', {
        cancelledStatus: 'cancelled',
      });

    if (query.search) {
      builder
        .andWhere(
          '(plan.title ILIKE :search OR plan.description ILIKE :search)',
          { search: `%${query.search}%` },
        )
        .addSelect(
          `CASE
             WHEN LOWER(plan.title) = LOWER(:exactSearch) THEN 3
             WHEN plan.title ILIKE :prefixSearch THEN 2
             ELSE 1
           END`,
          'relevance',
        )
        .setParameters({
          exactSearch: query.search,
          prefixSearch: `${query.search}%`,
        });
    } else {
      builder.addSelect('0', 'relevance');
    }

    if (query.categoryIds) {
      builder.andWhere(
        `EXISTS (
          SELECT 1
          FROM "plan_detail" "filterDetail"
          INNER JOIN "activity_category" "filterCategory"
            ON "filterCategory"."id_activity" = "filterDetail"."id_activity"
           AND "filterCategory"."deleted_at" IS NULL
          INNER JOIN "category" "filteredCategory"
            ON "filteredCategory"."id" = "filterCategory"."id_category"
           AND "filteredCategory"."deleted_at" IS NULL
          INNER JOIN "category_status" "filteredCategoryStatus"
            ON "filteredCategoryStatus"."id" = "filteredCategory"."id_category_status"
           AND "filteredCategoryStatus"."deleted_at" IS NULL
           AND "filteredCategoryStatus"."key" = 'active'
          WHERE "filterDetail"."id_plan" = "plan"."id"
            AND "filterDetail"."deleted_at" IS NULL
            AND "filterCategory"."id_category" IN (:...categoryIds)
        )`,
        { categoryIds: query.categoryIds },
      );
    }

    if (query.outingType) {
      builder.andWhere(
        `EXISTS (
          SELECT 1
          FROM "plan_request" "typeRequest"
          INNER JOIN "outing_type" "outingType"
            ON "outingType"."id" = "typeRequest"."id_outing_type"
           AND "outingType"."deleted_at" IS NULL
          WHERE "typeRequest"."id" = "plan"."id_plan_request"
            AND "typeRequest"."deleted_at" IS NULL
            AND ("outingType"."key" ILIKE :experienceType OR "outingType"."name" ILIKE :experienceType)
        )`,
        { experienceType: `%${query.outingType}%` },
      );
    }

    if (query.minPrice !== undefined) {
      builder.andWhere('plan.estimatedTotalCost >= :minPrice', {
        minPrice: query.minPrice,
      });
    }

    if (query.maxPrice !== undefined) {
      builder.andWhere('plan.estimatedTotalCost <= :maxPrice', {
        maxPrice: query.maxPrice,
      });
    }

    if (query.minRating !== undefined) {
      builder.andWhere(`${PLAN_AVERAGE_RATING_SQL} >= :minRating`, {
        minRating: query.minRating,
      });
    }

    if (query.latitude !== undefined && query.longitude !== undefined) {
      builder.addSelect(PLAN_DISTANCE_SQL, 'distanceKm').setParameters({
        latitude: query.latitude,
        longitude: query.longitude,
      });

      if (query.maxDistanceKm !== undefined) {
        builder.andWhere(`${PLAN_DISTANCE_SQL} <= :maxDistanceKm`, {
          maxDistanceKm: query.maxDistanceKm,
        });
      }
    } else {
      builder.addSelect('NULL', 'distanceKm');
    }

    return builder;
  }

  private applyOrdering(
    builder: SelectQueryBuilder<Plan>,
    query: PlanSearchQueryDto,
    sortBy: PlanSortField,
  ): void {
    const direction = query.direction.toUpperCase() as 'ASC' | 'DESC';

    switch (sortBy) {
      case PlanSortField.PRICE:
        builder.orderBy('plan.estimatedTotalCost', direction);
        break;
      case PlanSortField.RATING:
        builder.orderBy(PLAN_AVERAGE_RATING_SQL, 'DESC', 'NULLS LAST');
        break;
      case PlanSortField.DISTANCE:
        builder.orderBy(PLAN_DISTANCE_SQL, 'ASC', 'NULLS LAST');
        break;
      case PlanSortField.RELEVANCE:
        builder.orderBy(
          query.search ? 'relevance' : PLAN_AVERAGE_RATING_SQL,
          'DESC',
        );
        break;
    }

    builder.addOrderBy('plan.id', 'ASC');
  }

  private mapSummary(row: PlanSummaryRow): PlanSummaryDto {
    return {
      id: Number(row.id),
      title: row.title,
      description: row.description,
      estimatedTotalCost: Number(row.estimatedTotalCost),
      estimatedTotalDuration: Number(row.estimatedTotalDuration),
      activityCount: Number(row.activityCount),
      averageRating: this.round(Number(row.averageRating)),
      distanceKm:
        row.distanceKm === null ? null : this.round(Number(row.distanceKm)),
      categories: row.categories,
      status: { key: row.statusKey, name: row.statusName },
    };
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
