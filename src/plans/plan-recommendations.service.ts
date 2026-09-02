import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { createPaginatedResponse } from '../common/pagination/paginated-response';
import { DismissedRecommendation } from './entities/dismissed-recommendation.entity';
import { Plan } from './entities/plan.entity';
import { PlanRecommendationsResponseDto } from './dto/plan-recommendation.dto';
import { PlanRecommendationQueryDto } from './dto/plan-recommendation-query.dto';
import { DEFAULT_RECOMMENDATION_RADIUS_KM } from './plan-recommendations.constants';
import { rankRecommendations } from './plan-recommendations.ranking';
import {
  buildFeedbackProfile,
  FeedbackProfile,
  FeedbackProfileRow,
} from './recommendation-feedback-profile';
import {
  PLAN_ACTIVITY_NAMES_SQL,
  PLAN_AVERAGE_RATING_SQL,
  PLAN_CATEGORY_JSON_SQL,
  PLAN_DISTANCE_SQL,
  PLAN_IMAGE_URL_SQL,
  PLAN_VIEWER_STATE_SQL,
  PlanSummaryRow,
} from './plan-summary.sql';

/**
 * Recommends real, navigable plans on the Home (CU20/US19) and lets the user
 * shape that list with two levers (CU21):
 *
 * - post-experience feedback (CU23) nudges the ranking — see
 *   `recommendation-feedback-profile.ts` and `plan-recommendations.ranking.ts`;
 * - dismissing a card removes that plan from the list permanently (with a short
 *   client-side "Deshacer" that calls `restore`).
 *
 * The pool is other users' `public`, `completed` plans. This service loads the
 * pool and the caller's signals; ranking stays pure. Same inputs, same order.
 */
@Injectable()
export class PlanRecommendationsService {
  constructor(
    @InjectRepository(Plan)
    private readonly plans: Repository<Plan>,
    @InjectRepository(DismissedRecommendation)
    private readonly dismissed: Repository<DismissedRecommendation>,
  ) {}

  async recommend(
    userId: number,
    query: PlanRecommendationQueryDto,
  ): Promise<PlanRecommendationsResponseDto> {
    const hasLocation =
      query.latitude !== undefined && query.longitude !== undefined;

    const [
      historyCategories,
      preferenceCategories,
      preferredRadius,
      dismissedPlanIds,
      feedbackProfile,
    ] = await Promise.all([
      this.loadHistoryCategories(userId),
      this.loadPreferenceCategories(userId),
      this.loadPreferredRadiusKm(userId),
      this.loadDismissedPlanIds(userId),
      this.loadFeedbackProfile(userId),
    ]);

    const personalized =
      historyCategories.size > 0 || preferenceCategories.size > 0;
    const radiusKm = hasLocation
      ? (query.maxDistanceKm ??
        preferredRadius ??
        DEFAULT_RECOMMENDATION_RADIUS_KM)
      : null;

    const rows = await this.loadCandidates(
      userId,
      query,
      radiusKm,
      dismissedPlanIds,
    );
    const ranked = rankRecommendations(rows, {
      historyCategories,
      preferenceCategories,
      hasLocation,
      radiusKm,
      feedbackProfile,
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
      meta: {
        personalized,
        locationUsed: hasLocation,
        adjustedFromFeedback: feedbackProfile.hasSignal,
      },
    };
  }

  /** Records that the caller no longer wants this plan recommended (CU21). */
  async dismiss(userId: number, planId: number): Promise<void> {
    await this.assertDismissablePlan(userId, planId);
    await this.dismissed.query(
      `INSERT INTO "dismissed_recommendation" ("id_user", "id_plan")
       VALUES ($1, $2)
       ON CONFLICT ("id_user", "id_plan") WHERE "deleted_at" IS NULL DO NOTHING`,
      [userId, planId],
    );
  }

  /** Undoes a dismissal — the plan can be recommended again. Idempotent. */
  async restore(userId: number, planId: number): Promise<void> {
    const row = await this.dismissed.findOne({
      where: { idUser: userId, idPlan: planId },
    });
    if (row) await this.dismissed.softRemove(row);
  }

  private async assertDismissablePlan(
    userId: number,
    planId: number,
  ): Promise<void> {
    const plan = await this.plans.findOne({ where: { id: planId } });
    if (!plan) {
      throw new NotFoundException({
        code: 'PLAN_NOT_FOUND',
        message: 'The requested plan does not exist',
      });
    }
    if (plan.idUser === userId) {
      throw new ForbiddenException({
        code: 'CANNOT_DISMISS_OWN_PLAN',
        message: 'You can only dismiss plans recommended to you',
      });
    }
  }

  /** Plan ids the caller dismissed from the Home rail (CU21). */
  private async loadDismissedPlanIds(userId: number): Promise<Set<number>> {
    const rows = await this.dismissed.query<Array<{ id_plan: number }>>(
      `
        SELECT "id_plan"
        FROM "dismissed_recommendation"
        WHERE "id_user" = $1 AND "deleted_at" IS NULL
      `,
      [userId],
    );
    return new Set(rows.map((row) => Number(row.id_plan)));
  }

  /** The user's own feedback distilled into ranking signals (CU21/CU23). */
  private async loadFeedbackProfile(userId: number): Promise<FeedbackProfile> {
    const rows = await this.plans.manager.query<
      Array<{
        feedbackId: number;
        rating: number;
        tags: string[] | null;
        actualCost: string | null;
        estimatedTotalCost: string | null;
        idCategory: number | null;
      }>
    >(
      `
        SELECT
          "f"."id" AS "feedbackId",
          "f"."rating" AS "rating",
          "f"."tags" AS "tags",
          "f"."actual_cost" AS "actualCost",
          "p"."estimated_total_cost" AS "estimatedTotalCost",
          "ac"."id_category" AS "idCategory"
        FROM "feedback" "f"
        INNER JOIN "feedback_status" "fs"
          ON "fs"."id" = "f"."id_feedback_status"
         AND "fs"."key" IN ('pending', 'processed')
        INNER JOIN "plan" "p"
          ON "p"."id" = "f"."id_plan"
         AND "p"."deleted_at" IS NULL
         AND "p"."id_user" = $1
        INNER JOIN "plan_status" "ps"
          ON "ps"."id" = "p"."id_plan_status" AND "ps"."key" = 'completed'
        LEFT JOIN "plan_detail" "pd"
          ON "pd"."id_plan" = "p"."id" AND "pd"."deleted_at" IS NULL
        LEFT JOIN "activity_category" "ac"
          ON "ac"."id_activity" = "pd"."id_activity"
         AND "ac"."deleted_at" IS NULL
        WHERE "f"."deleted_at" IS NULL
      `,
      [userId],
    );

    const normalized: FeedbackProfileRow[] = rows.map((row) => ({
      feedbackId: Number(row.feedbackId),
      rating: Number(row.rating),
      tags: row.tags ?? [],
      actualCost: row.actualCost === null ? null : Number(row.actualCost),
      estimatedTotalCost:
        row.estimatedTotalCost === null ? null : Number(row.estimatedTotalCost),
      idCategory: row.idCategory === null ? null : Number(row.idCategory),
    }));

    return buildFeedbackProfile(normalized);
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
    dismissedPlanIds: Set<number>,
  ): Promise<PlanSummaryRow[]> {
    const builder = this.candidateBuilder(radiusKm !== null, userId)
      .andWhere('plan.visibility = :publicVisibility', {
        publicVisibility: 'public',
      })
      .andWhere('status.key = :completedStatus', {
        completedStatus: 'completed',
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

    if (dismissedPlanIds.size > 0) {
      builder.andWhere('plan.id NOT IN (:...dismissedPlanIds)', {
        dismissedPlanIds: [...dismissedPlanIds],
      });
    }

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
      .getRawMany<PlanSummaryRow>();
  }

  private candidateBuilder(
    hasLocation: boolean,
    viewerUserId: number,
  ): SelectQueryBuilder<Plan> {
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
      .addSelect(PLAN_VIEWER_STATE_SQL, 'viewerPlanState')
      .setParameter('viewerUserId', viewerUserId)
      .addSelect(hasLocation ? PLAN_DISTANCE_SQL : 'NULL', 'distanceKm')
      .where('plan.deletedAt IS NULL');
  }
}
