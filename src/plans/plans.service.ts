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
import { Activity } from '../activities/entities/activity.entity';
import {
  AuditAction,
  AuditLog,
} from '../administration/entities/audit-log.entity';
import {
  createPaginatedResponse,
  PaginatedResponse,
} from '../common/pagination/paginated-response';
import { validateExplorationQuery } from '../common/search/exploration-query.validation';
import { Plan } from './entities/plan.entity';
import { PlanDetail } from './entities/plan-detail.entity';
import { PlanStatus } from './entities/plan-status.entity';
import { PlanIntention } from './entities/plan-intention.entity';
import { AddPlanDetailDto } from './dto/add-plan-detail.dto';
import { CreatePlanDto } from './dto/create-plan.dto';
import { ListOwnPlansQueryDto } from './dto/list-own-plans-query.dto';
import { PlanDetailResponseDto, PlanSummaryDto } from './dto/plan-response.dto';
import { canViewerActOnPlan, ViewerPlanState } from './plan-selectability';
import { PlanSearchQueryDto, PlanSortField } from './dto/plan-search-query.dto';
import { toPlanFeedbackDto } from './dto/plan-feedback.dto';
import type { FeedbackState } from './dto/plan-feedback.dto';
import {
  OwnPlanDetailDto,
  OwnPlanSummaryDto,
} from './dto/owner-plan-response.dto';

/**
 * How long after a plan is `completed` its feedback window opens (CU23),
 * matching the worker's reminder threshold (`COMPLETED_THRESHOLD_HOURS`).
 */
const FEEDBACK_AVAILABLE_AFTER_MS = 24 * 60 * 60 * 1000;
import { UpdatePlanDto } from './dto/update-plan.dto';
import { RatingModerationStatus } from '../ratings/entities/rating.entity';

const PLAN_AVERAGE_RATING_SQL = `
  COALESCE((
    SELECT AVG("planRating"."score")
    FROM "plan_detail" "ratingDetail"
    INNER JOIN "rating" "planRating"
      ON "planRating"."id_activity" = "ratingDetail"."id_activity"
     AND "planRating"."deleted_at" IS NULL
     AND "planRating"."moderation_status" = 'approved'
    WHERE "ratingDetail"."id_plan" = "plan"."id"
      AND "ratingDetail"."deleted_at" IS NULL
  ), 0)
`;

const PLAN_CATEGORY_JSON_SQL = `
  COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object('id', "planCategory"."id", 'name', "planCategory"."name")
      ORDER BY "planCategory"."name", "planCategory"."id"
    )
    FROM (
      SELECT DISTINCT "category"."id", "category"."name"
      FROM "plan_detail" "categoryDetail"
      INNER JOIN "activity_category" "categoryRelation"
        ON "categoryRelation"."id_activity" = "categoryDetail"."id_activity"
       AND "categoryRelation"."deleted_at" IS NULL
      INNER JOIN "category" "category"
        ON "category"."id" = "categoryRelation"."id_category"
       AND "category"."deleted_at" IS NULL
      INNER JOIN "category_status" "categoryStatus"
        ON "categoryStatus"."id" = "category"."id_category_status"
       AND "categoryStatus"."deleted_at" IS NULL
       AND "categoryStatus"."key" = 'active'
      WHERE "categoryDetail"."id_plan" = "plan"."id"
        AND "categoryDetail"."deleted_at" IS NULL
    ) "planCategory"
  ), '[]'::jsonb)
`;

const PLAN_ACTIVITY_NAMES_SQL = `
  COALESCE((
    SELECT jsonb_agg("nameActivity"."name" ORDER BY "nameDetail"."order")
    FROM "plan_detail" "nameDetail"
    INNER JOIN "activity" "nameActivity"
      ON "nameActivity"."id" = "nameDetail"."id_activity"
     AND "nameActivity"."deleted_at" IS NULL
    WHERE "nameDetail"."id_plan" = "plan"."id"
      AND "nameDetail"."deleted_at" IS NULL
  ), '[]'::jsonb)
`;

const PLAN_DISTANCE_SQL = `
  (SELECT MIN(
    6371 * ACOS(LEAST(1, GREATEST(-1,
      COS(RADIANS(:latitude))
      * COS(RADIANS("planPlace"."latitude"::double precision))
      * COS(RADIANS("planPlace"."longitude"::double precision) - RADIANS(:longitude))
      + SIN(RADIANS(:latitude))
      * SIN(RADIANS("planPlace"."latitude"::double precision))
    )))
  )
  FROM "plan_detail" "distanceDetail"
  INNER JOIN "activity_place" "planPlace"
    ON "planPlace"."id_activity" = "distanceDetail"."id_activity"
   AND "planPlace"."deleted_at" IS NULL
  WHERE "distanceDetail"."id_plan" = "plan"."id"
    AND "distanceDetail"."deleted_at" IS NULL
    AND "planPlace"."latitude" IS NOT NULL
    AND "planPlace"."longitude" IS NOT NULL)
`;

interface PlanSearchRow {
  id: string;
  title: string;
  description: string | null;
  estimatedTotalCost: string;
  estimatedTotalDuration: string;
  averageRating: string;
  distanceKm: string | null;
  categories: Array<{ id: number; name: string }>;
  activityNames: string[];
  statusKey: string;
  statusName: string;
  viewerPlanState: ViewerPlanState;
}

const PLAN_VIEWER_STATE_SQL = `
  CASE
    WHEN CAST(:viewerUserId AS integer) IS NULL
      OR status.key = 'cancelled' THEN 'view-only'
    WHEN EXISTS (SELECT 1 FROM "plan_intention" intention
      WHERE intention.id_plan = plan.id AND intention.id_user = CAST(:viewerUserId AS integer)
        AND intention.deleted_at IS NULL) THEN 'selected'
    ELSE 'selectable'
  END
`;

@Injectable()
export class PlansService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Plan)
    private readonly plans: Repository<Plan>,
  ) {}

  async listOwn(
    idUser: number,
    query: ListOwnPlansQueryDto,
  ): Promise<PaginatedResponse<OwnPlanSummaryDto>> {
    const [plans, total] = await this.plans.findAndCount({
      where: { idUser },
      relations: { status: true, details: true, feedback: true },
      // `id: 'ASC'` as a tie-break, same as `search()`'s `applyOrdering`:
      // without it, two plans sharing a `createdAt` have no stable order,
      // and pagination can duplicate or skip a plan across pages.
      order: {
        createdAt: query.direction.toUpperCase() as 'ASC' | 'DESC',
        id: 'ASC',
      },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return createPaginatedResponse(
      plans.map((plan) => this.toOwnPlanSummary(plan)),
      total,
      query.page,
      query.limit,
    );
  }

  async create(idUser: number, dto: CreatePlanDto): Promise<OwnPlanDetailDto> {
    return this.dataSource.transaction(async (manager) => {
      const status = await this.findStatusByKey(manager, 'confirmed');
      const plan = await manager.save(
        manager.create(Plan, {
          idUser,
          idPlanRequest: null,
          idPlanStatus: status.id,
          title: dto.title,
          description: dto.description ?? null,
          peopleCount: dto.peopleCount,
          estimatedTotalCost: 0,
          estimatedTotalDuration: 0,
        }),
      );
      await this.audit(manager, AuditAction.Create, 'plan', plan.id, {
        title: plan.title,
        peopleCount: plan.peopleCount,
      });
      return this.toOwnPlanDetail(
        await this.findOwnPlan(idUser, plan.id, manager),
      );
    });
  }

  async findOwnOne(idUser: number, id: number): Promise<OwnPlanDetailDto> {
    return this.toOwnPlanDetail(await this.findOwnPlan(idUser, id));
  }

  async update(
    idUser: number,
    id: number,
    dto: UpdatePlanDto,
  ): Promise<OwnPlanDetailDto> {
    if (
      dto.title === undefined &&
      dto.description === undefined &&
      dto.peopleCount === undefined
    ) {
      throw new BadRequestException({
        code: 'PLAN_UPDATE_EMPTY',
        message: 'At least one plan field must be provided',
      });
    }

    return this.dataSource.transaction(async (manager) => {
      const plan = await this.lockOwnPlan(idUser, id, manager);
      await this.assertMutable(plan, manager);
      const original = {
        title: plan.title,
        description: plan.description,
        peopleCount: plan.peopleCount,
      };
      if (dto.title !== undefined) plan.title = dto.title;
      if (dto.description !== undefined) plan.description = dto.description;
      if (dto.peopleCount !== undefined) plan.peopleCount = dto.peopleCount;
      await manager.save(plan);
      await this.audit(manager, AuditAction.Update, 'plan', id, {
        ...original,
        title: plan.title,
        description: plan.description,
        peopleCount: plan.peopleCount,
      });
      return this.toOwnPlanDetail(await this.findOwnPlan(idUser, id, manager));
    });
  }

  async cancel(idUser: number, id: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const plan = await this.lockOwnPlan(idUser, id, manager);
      await this.assertMutable(plan, manager);
      const cancelled = await this.findStatusByKey(manager, 'cancelled');
      plan.idPlanStatus = cancelled.id;
      await manager.save(plan);
      await this.audit(manager, AuditAction.Delete, 'plan', id, {
        status: 'cancelled',
      });
    });
  }

  async addDetail(
    idUser: number,
    id: number,
    dto: AddPlanDetailDto,
  ): Promise<OwnPlanDetailDto> {
    return this.dataSource.transaction(async (manager) => {
      const plan = await this.lockOwnPlan(idUser, id, manager);
      await this.assertMutable(plan, manager);
      const activity = await manager.findOne(Activity, {
        where: { id: dto.activityId },
      });
      if (!activity) this.throwActivityNotFound();

      const existing = await manager.findOne(PlanDetail, {
        where: { idPlan: id, idActivity: dto.activityId },
      });
      if (existing) {
        throw new ConflictException({
          code: 'ACTIVITY_ALREADY_IN_PLAN',
          message: 'The activity is already included in this plan',
        });
      }

      const rawOrder = await manager
        .createQueryBuilder(PlanDetail, 'detail')
        .select('COALESCE(MAX(detail.order), 0)', 'maxOrder')
        .where('detail.id_plan = :idPlan', { idPlan: id })
        .getRawOne<{ maxOrder: string }>();
      const detail = await manager.save(
        manager.create(PlanDetail, {
          idPlan: id,
          idActivity: activity.id,
          order: Number(rawOrder?.maxOrder ?? 0) + 1,
          estimatedCost: activity.estimatedCost,
          estimatedDuration: activity.estimatedDuration,
          note: null,
        }),
      );
      await this.recalculateTotals(plan, manager);
      await this.audit(manager, AuditAction.Create, 'plan_detail', detail.id, {
        planId: id,
        activityId: activity.id,
      });
      return this.toOwnPlanDetail(await this.findOwnPlan(idUser, id, manager));
    });
  }

  async removeDetail(
    idUser: number,
    id: number,
    detailId: number,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const plan = await this.lockOwnPlan(idUser, id, manager);
      await this.assertMutable(plan, manager);
      const detail = await manager.findOne(PlanDetail, {
        where: { id: detailId, idPlan: id },
      });
      if (!detail) this.throwPlanDetailNotFound();

      await manager.softRemove(detail);
      await manager
        .createQueryBuilder()
        .update(PlanDetail)
        .set({ order: () => '"order" - 1' })
        .where('id_plan = :idPlan', { idPlan: id })
        .andWhere('"order" > :order', { order: detail.order })
        .andWhere('deleted_at IS NULL')
        .execute();
      await this.recalculateTotals(plan, manager);
      await this.audit(manager, AuditAction.Delete, 'plan_detail', detailId, {
        planId: id,
        activityId: detail.idActivity,
      });
    });
  }

  async search(
    query: PlanSearchQueryDto,
    viewerUserId: number | null = null,
  ): Promise<PaginatedResponse<PlanSummaryDto>> {
    const sortBy = query.sortBy ?? PlanSortField.RELEVANCE;
    validateExplorationQuery(query, sortBy === PlanSortField.DISTANCE);

    const builder = this.createSearchBuilder(query, viewerUserId);
    const total = await builder.getCount();
    this.applyOrdering(builder, query, sortBy);

    const rows = await builder
      .offset((query.page - 1) * query.limit)
      .limit(query.limit)
      .getRawMany<PlanSearchRow>();

    return createPaginatedResponse(
      rows.map((row) => this.mapSummary(row)),
      total,
      query.page,
      query.limit,
    );
  }

  async findOne(
    id: number,
    viewerUserId: number | null = null,
  ): Promise<PlanDetailResponseDto> {
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

    const viewerPlanState = await this.computeViewerPlanState(
      plan,
      viewerUserId,
    );

    const details = [...plan.details]
      .sort((left, right) => left.order - right.order)
      .map((detail) => {
        const scores = detail.activity.ratings
          .filter(
            (rating) =>
              rating.moderationStatus === RatingModerationStatus.Approved,
          )
          .map((rating) => rating.score);
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
              externalRating:
                location.externalRating == null ||
                location.externalRatingCount == null
                  ? null
                  : {
                      rating: location.externalRating,
                      ratingCount: location.externalRatingCount,
                    },
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
      detail.activity.ratings
        .filter(
          (rating) =>
            rating.moderationStatus === RatingModerationStatus.Approved,
        )
        .map((rating) => rating.score),
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
      activityNames: details.map((detail) => detail.activity.name),
      // No plan/activity image source in the domain yet (CU20 contract).
      imageUrl: null,
      status: { key: plan.status.key, name: plan.status.name },
      viewerPlanState,
      details,
    };
  }

  /**
   * `viewerPlanState` (CU22) for `GET /plans/:id`. Any authenticated viewer can
   * hold an intention on a plan that is not `cancelled`; an anonymous viewer,
   * or a cancelled plan, is `view-only` without a query.
   */
  private async computeViewerPlanState(
    plan: Plan,
    viewerUserId: number | null,
  ): Promise<ViewerPlanState> {
    if (
      !canViewerActOnPlan({
        viewerUserId,
        statusKey: plan.status.key,
      })
    )
      return 'view-only';
    const intention = await this.dataSource
      .getRepository(PlanIntention)
      .findOne({
        where: { idPlan: plan.id, idUser: viewerUserId as number },
      });
    return intention ? 'selected' : 'selectable';
  }

  private async findOwnPlan(
    idUser: number,
    id: number,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<Plan> {
    const plan = await manager.findOne(Plan, {
      where: { id, idUser },
      relations: { status: true, details: { activity: true }, feedback: true },
    });
    if (!plan) this.throwPlanNotFound();
    return plan;
  }

  private async lockOwnPlan(
    idUser: number,
    id: number,
    manager: EntityManager,
  ): Promise<Plan> {
    const plan = await manager
      .createQueryBuilder(Plan, 'plan')
      .setLock('pessimistic_write')
      .where('plan.id = :id', { id })
      .andWhere('plan.id_user = :idUser', { idUser })
      .getOne();
    if (!plan) this.throwPlanNotFound();
    return plan;
  }

  private async assertMutable(
    plan: Plan,
    manager: EntityManager,
  ): Promise<void> {
    const status = await manager.findOne(PlanStatus, {
      where: { id: plan.idPlanStatus },
    });
    if (status?.key === 'cancelled') {
      throw new ConflictException({
        code: 'PLAN_CANCELLED',
        message: 'Cancelled plans cannot be modified',
      });
    }
  }

  private async findStatusByKey(
    manager: EntityManager,
    key: string,
  ): Promise<PlanStatus> {
    const status = await manager.findOne(PlanStatus, { where: { key } });
    if (!status) {
      throw new NotFoundException({
        code: 'PLAN_STATUS_NOT_AVAILABLE',
        message: 'The required plan status is not available',
      });
    }
    return status;
  }

  private async recalculateTotals(
    plan: Plan,
    manager: EntityManager,
  ): Promise<void> {
    const totals = await manager
      .createQueryBuilder(PlanDetail, 'detail')
      .select('COALESCE(SUM(detail.estimated_cost), 0)', 'totalCost')
      .addSelect('COALESCE(SUM(detail.estimated_duration), 0)', 'totalDuration')
      .where('detail.id_plan = :idPlan', { idPlan: plan.id })
      .getRawOne<{ totalCost: string; totalDuration: string }>();
    plan.estimatedTotalCost = Number(totals?.totalCost ?? 0);
    plan.estimatedTotalDuration = Number(totals?.totalDuration ?? 0);
    await manager.save(plan);
  }

  private toOwnPlanSummary(plan: Plan): OwnPlanSummaryDto {
    return {
      id: plan.id,
      title: plan.title,
      description: plan.description,
      estimatedTotalCost: plan.estimatedTotalCost,
      estimatedTotalDuration: plan.estimatedTotalDuration,
      peopleCount: plan.peopleCount,
      estimatedCostPerPerson: this.round(
        plan.estimatedTotalCost / plan.peopleCount,
      ),
      activityCount: plan.details?.length ?? 0,
      status: { key: plan.status.key, name: plan.status.name },
      completedAt: plan.completedAt,
      feedbackState: this.resolveFeedbackState(plan),
      feedback: plan.feedback ? toPlanFeedbackDto(plan.feedback) : null,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  }

  /**
   * Where a plan sits in the CU23 feedback lifecycle. Authoritative — the
   * client never recomputes this from timestamps. No `expired`: US18 defines
   * no closing window (see {@link FeedbackState}).
   */
  private resolveFeedbackState(plan: Plan): FeedbackState {
    if (plan.feedback) return 'submitted';
    if (plan.status.key !== 'completed') return 'not_available';
    if (plan.feedbackRequestedAt) return 'available';
    if (
      plan.completedAt &&
      Date.now() - plan.completedAt.getTime() >= FEEDBACK_AVAILABLE_AFTER_MS
    ) {
      return 'available';
    }
    return 'not_available';
  }

  private toOwnPlanDetail(plan: Plan): OwnPlanDetailDto {
    return {
      ...this.toOwnPlanSummary(plan),
      details: [...plan.details]
        .sort((left, right) => left.order - right.order)
        .map((detail) => ({
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
          },
        })),
    };
  }

  private async audit(
    manager: EntityManager,
    action: AuditAction,
    affectedEntity: 'plan' | 'plan_detail',
    affectedEntityId: number,
    changes: Record<string, unknown>,
  ): Promise<void> {
    await manager.save(
      manager.create(AuditLog, {
        action,
        affectedEntity,
        affectedEntityId,
        original: null,
        changes,
      }),
    );
  }

  private throwPlanNotFound(): never {
    throw new NotFoundException({
      code: 'PLAN_NOT_FOUND',
      message: 'The requested plan does not exist',
    });
  }

  private throwPlanDetailNotFound(): never {
    throw new NotFoundException({
      code: 'PLAN_DETAIL_NOT_FOUND',
      message: 'The requested plan activity does not exist',
    });
  }

  private throwActivityNotFound(): never {
    throw new NotFoundException({
      code: 'ACTIVITY_NOT_FOUND',
      message: 'The requested activity does not exist',
    });
  }

  private createSearchBuilder(
    query: PlanSearchQueryDto,
    viewerUserId: number | null,
  ): SelectQueryBuilder<Plan> {
    const builder = this.plans
      .createQueryBuilder('plan')
      .innerJoin('plan.status', 'status')
      .select('plan.id', 'id')
      .addSelect('plan.title', 'title')
      .addSelect('plan.description', 'description')
      .addSelect('plan.estimatedTotalCost', 'estimatedTotalCost')
      .addSelect('plan.estimatedTotalDuration', 'estimatedTotalDuration')
      .addSelect(PLAN_AVERAGE_RATING_SQL, 'averageRating')
      .addSelect(PLAN_CATEGORY_JSON_SQL, 'categories')
      .addSelect(PLAN_ACTIVITY_NAMES_SQL, 'activityNames')
      .addSelect('status.key', 'statusKey')
      .addSelect('status.name', 'statusName')
      .addSelect(PLAN_VIEWER_STATE_SQL, 'viewerPlanState')
      .setParameter('viewerUserId', viewerUserId)
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

  private mapSummary(row: PlanSearchRow): PlanSummaryDto {
    return {
      id: Number(row.id),
      title: row.title,
      description: row.description,
      estimatedTotalCost: Number(row.estimatedTotalCost),
      estimatedTotalDuration: Number(row.estimatedTotalDuration),
      // Derived from `activityNames` instead of its own subquery. This is
      // deliberately NOT the count the removed `PLAN_ACTIVITY_COUNT_SQL`
      // returned: `PLAN_ACTIVITY_NAMES_SQL` also joins `activity` and skips
      // soft-deleted ones, so a `plan_detail` pointing at a deleted activity
      // no longer counts. That is the intended contract -- a deleted activity
      // must not appear in the itinerary chain, and the count has to agree
      // with the names next to it -- but it does change what this field
      // reports once anything starts soft-deleting activities (CU56).
      activityCount: row.activityNames.length,
      averageRating: this.round(Number(row.averageRating)),
      distanceKm:
        row.distanceKm === null ? null : this.round(Number(row.distanceKm)),
      categories: row.categories,
      activityNames: row.activityNames,
      // No plan/activity image source in the domain yet (CU20 contract).
      imageUrl: null,
      status: { key: row.statusKey, name: row.statusName },
      viewerPlanState: row.viewerPlanState,
    };
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
