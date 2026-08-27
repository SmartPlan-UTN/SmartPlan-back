import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { createPaginatedResponse } from '../common/pagination/paginated-response';
import { Plan } from './entities/plan.entity';
import { PlanRecommendationsResponseDto } from './dto/plan-recommendation.dto';
import { PlanRecommendationQueryDto } from './dto/plan-recommendation-query.dto';
import {
  CANDIDATE_PREFILTER_LIMIT,
  DEFAULT_RECOMMENDATION_RADIUS_KM,
} from './plan-recommendations.constants';
import { rankRecommendations } from './plan-recommendations.ranking';
import {
  PLAN_ACTIVITY_NAMES_SQL,
  PLAN_AVERAGE_RATING_SQL,
  PLAN_CATEGORY_JSON_SQL,
  PLAN_DISTANCE_SQL,
  PLAN_IMAGE_URL_SQL,
  PlanSummaryRow,
} from './plan-summary.sql';

/**
 * Recommends real, navigable plans on the Home (CU20/US19).
 *
 * The pool is other users' `public` plans — a plan turns `public` when it is
 * AI-generated and reaches `completed` (see {@link Plan.visibility}). Ranking
 * lives in `plan-recommendations.ranking.ts`; this service only loads the pool
 * and the caller's signals (completed-plan categories, saved preferences,
 * distance radius) and paginates the ranked result. Same inputs, same order.
 */
@Injectable()
export class PlanRecommendationsService {
  constructor(
    @InjectRepository(Plan)
    private readonly plans: Repository<Plan>,
  ) {}

  async recommend(
    userId: number,
    query: PlanRecommendationQueryDto,
  ): Promise<PlanRecommendationsResponseDto> {
    const hasLocation =
      query.latitude !== undefined && query.longitude !== undefined;

    const [historyCategories, preferenceCategories, preferredRadius] =
      await Promise.all([
        this.loadHistoryCategories(userId),
        this.loadPreferenceCategories(userId),
        this.loadPreferredRadiusKm(userId),
      ]);

    const personalized =
      historyCategories.size > 0 || preferenceCategories.size > 0;
    const radiusKm = hasLocation
      ? (query.maxDistanceKm ??
        preferredRadius ??
        DEFAULT_RECOMMENDATION_RADIUS_KM)
      : null;

    const rows = await this.loadCandidates(userId, query, radiusKm);
    const ranked = rankRecommendations(rows, {
      historyCategories,
      preferenceCategories,
      hasLocation,
      radiusKm,
    });

    const offset = (query.page - 1) * query.limit;
    const page = ranked.slice(offset, offset + query.limit);
    const { pagination } = createPaginatedResponse(
      page,
      ranked.length,
      query.page,
      query.limit,
    );

    return {
      data: page,
      pagination,
      meta: { personalized, locationUsed: hasLocation },
    };
  }

  /** Distinct category ids of the activities in the caller's completed plans. */
  private async loadHistoryCategories(userId: number): Promise<Set<number>> {
    const rows = await this.plans.manager.query<Array<{ id_category: number }>>(
      `
        SELECT DISTINCT "ac"."id_category"
        FROM "plan" "p"
        INNER JOIN "plan_status" "ps"
          ON "ps"."id" = "p"."id_plan_status" AND "ps"."key" = 'completed'
        INNER JOIN "plan_detail" "pd"
          ON "pd"."id_plan" = "p"."id" AND "pd"."deleted_at" IS NULL
        INNER JOIN "activity_category" "ac"
          ON "ac"."id_activity" = "pd"."id_activity" AND "ac"."deleted_at" IS NULL
        WHERE "p"."id_user" = $1 AND "p"."deleted_at" IS NULL
      `,
      [userId],
    );
    return new Set(rows.map((row) => Number(row.id_category)));
  }

  /** Category ids the user saved as preferences (CU8/CU18). */
  private async loadPreferenceCategories(userId: number): Promise<Set<number>> {
    const rows = await this.plans.manager.query<Array<{ id_category: number }>>(
      `
        SELECT "id_category"
        FROM "user_preference"
        WHERE "id_user" = $1 AND "deleted_at" IS NULL
      `,
      [userId],
    );
    return new Set(rows.map((row) => Number(row.id_category)));
  }

  /** The user's `maxDistanceKm` preference, if a profile row exists. */
  private async loadPreferredRadiusKm(userId: number): Promise<number | null> {
    const rows = await this.plans.manager.query<
      Array<{ max_distance_km: number | null }>
    >(
      `
        SELECT "max_distance_km"
        FROM "user_preference_profile"
        WHERE "id_user" = $1 AND "deleted_at" IS NULL
        LIMIT 1
      `,
      [userId],
    );
    const value = rows[0]?.max_distance_km;
    return value === null || value === undefined ? null : Number(value);
  }

  private async loadCandidates(
    userId: number,
    query: PlanRecommendationQueryDto,
    radiusKm: number | null,
  ): Promise<PlanSummaryRow[]> {
    const builder = this.candidateBuilder(radiusKm !== null)
      .andWhere('plan.visibility = :publicVisibility', {
        publicVisibility: 'public',
      })
      .andWhere('plan.id_user <> :userId', { userId })
      .andWhere(
        `EXISTS (
          SELECT 1 FROM "plan_detail" "hasDetail"
          INNER JOIN "activity" "hasActivity"
            ON "hasActivity"."id" = "hasDetail"."id_activity"
           AND "hasActivity"."deleted_at" IS NULL
          WHERE "hasDetail"."id_plan" = "plan"."id"
            AND "hasDetail"."deleted_at" IS NULL
        )`,
      );

    if (radiusKm !== null) {
      builder
        .andWhere(
          `(${PLAN_DISTANCE_SQL} IS NULL OR ${PLAN_DISTANCE_SQL} <= :radiusKm)`,
        )
        .setParameters({
          latitude: query.latitude,
          longitude: query.longitude,
          radiusKm,
        });
    }

    return builder
      .orderBy(PLAN_AVERAGE_RATING_SQL, 'DESC', 'NULLS LAST')
      .addOrderBy('plan.id', 'ASC')
      .limit(CANDIDATE_PREFILTER_LIMIT)
      .getRawMany<PlanSummaryRow>();
  }

  private candidateBuilder(hasLocation: boolean): SelectQueryBuilder<Plan> {
    return this.plans
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
      .addSelect(PLAN_IMAGE_URL_SQL, 'imageUrl')
      .addSelect('status.key', 'statusKey')
      .addSelect('status.name', 'statusName')
      .addSelect(hasLocation ? PLAN_DISTANCE_SQL : 'NULL', 'distanceKm')
      .where('plan.deletedAt IS NULL');
  }
}
