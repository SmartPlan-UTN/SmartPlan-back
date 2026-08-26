import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  createPaginatedResponse,
  PaginatedResponse,
} from '../common/pagination/paginated-response';
import { Plan } from './entities/plan.entity';
import { PlanRecommendationDto } from './dto/plan-recommendation.dto';
import { PlanRecommendationQueryDto } from './dto/plan-recommendation-query.dto';
import {
  PLAN_ACTIVITY_NAMES_SQL,
  PLAN_AVERAGE_RATING_SQL,
  PLAN_CATEGORY_JSON_SQL,
  PLAN_DISTANCE_SQL,
  PlanSummaryRow,
} from './plan-summary.sql';

const OWN_STATUS_KEYS = ['generated', 'selected', 'completed'];

@Injectable()
export class PlanRecommendationsService {
  constructor(
    @InjectRepository(Plan)
    private readonly plans: Repository<Plan>,
  ) {}

  /**
   * Recommends real, navigable Plan rows only — never synthetic objects
   * (plan section 8.2). `own` covers the user's own alternatives worth
   * revisiting; `popular` fills the remainder with other users' completed
   * plans, ranked deterministically by average activity rating. Both kinds
   * are projected through the same PlanSummaryDto the public catalog
   * already exposes, so `popular` never leaks anything ownership-specific.
   */
  async recommend(
    userId: number,
    query: PlanRecommendationQueryDto,
  ): Promise<PaginatedResponse<PlanRecommendationDto>> {
    const hasLocation =
      query.latitude !== undefined && query.longitude !== undefined;

    const ownBuilder = this.summaryBuilder(hasLocation)
      .andWhere('plan.id_user = :userId', { userId })
      .andWhere('status.key IN (:...ownStatusKeys)', {
        ownStatusKeys: OWN_STATUS_KEYS,
      });
    if (hasLocation) {
      ownBuilder.setParameters({
        latitude: query.latitude,
        longitude: query.longitude,
      });
    }
    const ownTotal = await ownBuilder.getCount();

    const popularBuilder = this.summaryBuilder(hasLocation)
      .andWhere('plan.id_user <> :userId', { userId })
      .andWhere('status.key = :completedStatus', {
        completedStatus: 'completed',
      });
    if (hasLocation) {
      popularBuilder.setParameters({
        latitude: query.latitude,
        longitude: query.longitude,
      });
    }
    const popularTotal = await popularBuilder.getCount();

    const total = ownTotal + popularTotal;
    const offset = (query.page - 1) * query.limit;

    const recommendations: PlanRecommendationDto[] = [];

    if (offset < ownTotal) {
      const ownRows = await ownBuilder
        .clone()
        .orderBy('plan.id', 'ASC')
        .offset(offset)
        .limit(query.limit)
        .getRawMany<PlanSummaryRow>();

      recommendations.push(
        ...ownRows.map((row) => this.toRecommendation(row, 'own')),
      );
    }

    const remaining = query.limit - recommendations.length;
    if (remaining > 0) {
      const popularOffset = Math.max(0, offset - ownTotal);
      const popularRows = await popularBuilder
        .clone()
        .orderBy(PLAN_AVERAGE_RATING_SQL, 'DESC', 'NULLS LAST')
        .addOrderBy('plan.id', 'ASC')
        .offset(popularOffset)
        .limit(remaining)
        .getRawMany<PlanSummaryRow>();

      recommendations.push(
        ...popularRows.map((row) => this.toRecommendation(row, 'popular')),
      );
    }

    return createPaginatedResponse(
      recommendations,
      total,
      query.page,
      query.limit,
    );
  }

  private summaryBuilder(hasLocation: boolean) {
    const builder = this.plans
      .createQueryBuilder('plan')
      .innerJoin('plan.status', 'status')
      .select('plan.id', 'id')
      .addSelect('plan.title', 'title')
      .addSelect('plan.description', 'description')
      .addSelect('plan.estimatedTotalCost', 'estimatedTotalCost')
      .addSelect('plan.estimatedTotalDuration', 'estimatedTotalDuration')
      .addSelect(PLAN_ACTIVITY_NAMES_SQL, 'activityNames')
      .addSelect(PLAN_AVERAGE_RATING_SQL, 'averageRating')
      .addSelect(PLAN_CATEGORY_JSON_SQL, 'categories')
      .addSelect('status.key', 'statusKey')
      .addSelect('status.name', 'statusName')
      .where('plan.deletedAt IS NULL');

    if (hasLocation) {
      builder.addSelect(PLAN_DISTANCE_SQL, 'distanceKm');
    } else {
      builder.addSelect('NULL', 'distanceKm');
    }

    return builder;
  }

  private toRecommendation(
    row: PlanSummaryRow,
    kind: 'own' | 'popular',
  ): PlanRecommendationDto {
    return {
      kind,
      plan: {
        id: Number(row.id),
        title: row.title,
        description: row.description,
        estimatedTotalCost: Number(row.estimatedTotalCost),
        estimatedTotalDuration: Number(row.estimatedTotalDuration),
        activityCount: row.activityNames.length,
        activityNames: row.activityNames,
        averageRating: this.round(Number(row.averageRating)),
        distanceKm:
          row.distanceKm === null ? null : this.round(Number(row.distanceKm)),
        categories: row.categories,
        status: { key: row.statusKey, name: row.statusName },
      },
      canSelect: kind === 'own' && row.statusKey === 'generated',
    };
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
