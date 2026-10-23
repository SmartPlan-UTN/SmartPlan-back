import { imageSourceOf } from '../media/image-source';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Category } from '../categories/entities/category.entity';
import { categoriesOfPlaceKind } from '../catalog/taxonomy';
import { Place } from '../places/entities/place.entity';
import {
  placeActionPrice,
  plannablePlaceAction,
} from '../planning-engine/place-action';
import {
  composerStopTarget,
  detailTargetKey,
  stopTargetKey,
} from './composer-stop';
import { insightOf } from './dto/plan-insight.dto';
import { computePlanReadiness } from './plan-readiness';
import { stopName, stopOf } from './plan-stop';
import { createHash } from 'crypto';
import {
  visibleExternalPrice,
  visibleExternalRating,
} from '../external-integration/external-rating';
import {
  computePlanTotals,
  costPerPerson,
  legacyEstimatedCost,
  planPriceSummary,
  snapshotValues,
  toPriceDto,
} from '../common/pricing/price';
import type { PriceCompleteness } from '../common/pricing/price';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  IsNull,
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
import { ContentStatus } from '../common/moderation/content-status';
import { Plan, PlanKind, PlanVisibility } from './entities/plan.entity';
import { PlanDetail } from './entities/plan-detail.entity';
import { PlanStatus } from './entities/plan-status.entity';
import { AddPlanDetailDto } from './dto/add-plan-detail.dto';
import { CreatePlanDto } from './dto/create-plan.dto';
import { ListOwnPlansQueryDto } from './dto/list-own-plans-query.dto';
import { PlanDetailResponseDto, PlanSummaryDto } from './dto/plan-response.dto';
import {
  canViewerActOnPlan,
  canViewerReadPlan,
  EXPLORE_LISTING,
} from './plan-selectability';
import type { PlanAccessFacts, ViewerPlanState } from './plan-selectability';
import { PlanSearchQueryDto, PlanSortField } from './dto/plan-search-query.dto';
import {
  OwnPlanDetailDto,
  OwnPlanSummaryDto,
} from './dto/owner-plan-response.dto';
import {
  CreatePlanComposerDto,
  PlanComposerStopDto,
  UpdatePlanComposerDto,
} from './dto/plan-composer.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { publicRatingScores } from '../ratings/public-rating-scores';
import { MediaService } from '../media/media.service';
import {
  PLAN_ACTIVE_OUTING_ID_SQL,
  PLAN_ACTIVITY_NAMES_SQL,
  PLAN_AVERAGE_RATING_SQL,
  PLAN_CATEGORY_JSON_SQL,
  PLAN_DISTANCE_SQL,
  PLAN_IMAGE_URL_SQL,
  PLAN_VIEWER_STATE_SQL,
} from './plan-summary.sql';

interface PlanSearchRow {
  id: string;
  title: string;
  description: string | null;
  estimatedTotalCost: string | null;
  estimatedTotalCostMax: string | null;
  unpricedCount: string;
  priceCompleteness: PriceCompleteness;
  estimatedTotalDuration: string;
  averageRating: string;
  distanceKm: string | null;
  categories: Array<{ id: number; name: string }>;
  activityNames: string[];
  imageUrl: string | null;
  statusKey: string;
  statusName: string;
  viewerPlanState: ViewerPlanState;
  activeOutingId: string | null;
}

@Injectable()
export class PlansService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Plan)
    private readonly plans: Repository<Plan>,
    private readonly media: MediaService,
  ) {}

  async listOwn(
    idUser: number,
    query: ListOwnPlansQueryDto,
  ): Promise<PaginatedResponse<OwnPlanSummaryDto>> {
    const [plans, total] = await this.plans.findAndCount({
      // Only what the person created: generated results and outings live
      // elsewhere ("Mis salidas", #98).
      where: { idUser, kind: PlanKind.Authored },
      relations: { status: true, details: true },
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
          kind: PlanKind.Authored,
          visibility: PlanVisibility.Private,
          idPlanRequest: null,
          idPlanStatus: status.id,
          title: dto.title,
          description: dto.description ?? null,
          peopleCount: dto.peopleCount,
          estimatedTotalCost: 0,
          estimatedTotalCostMax: 0,
          estimatedTotalDuration: 0,
        }),
      );
      await this.audit(manager, idUser, AuditAction.Create, 'plan', plan.id, {
        title: plan.title,
        peopleCount: plan.peopleCount,
      });
      return this.toOwnPlanDetail(
        await this.findOwnPlan(idUser, plan.id, manager),
      );
    });
  }

  /** Creates the complete plan in one transaction and uses requestId as the
   * identity of the in-memory client draft so a retry cannot duplicate it.
   * `statusKey` is only used when the plan is created; the web composer
   * always creates `confirmed` plans, the MCP loader may pick another. */
  async createFromComposer(
    idUser: number,
    dto: CreatePlanComposerDto,
    statusKey = 'confirmed',
  ): Promise<OwnPlanDetailDto> {
    return this.dataSource.transaction(async (manager) => {
      // Serialize concurrent retries for this user-owned draft before the
      // unique row exists. The idempotency key is never shared across users.
      await manager.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [
        idUser,
        dto.requestId,
      ]);
      const existing = await manager.findOne(Plan, {
        where: {
          idUser,
          kind: PlanKind.Authored,
          composerRequestId: dto.requestId,
        },
      });
      const plan =
        existing ??
        manager.create(Plan, {
          idUser,
          kind: PlanKind.Authored,
          idPlanRequest: null,
          idPlanStatus: (await this.findStatusByKey(manager, statusKey)).id,
          title: dto.title,
          description: dto.description ?? null,
          peopleCount: dto.peopleCount,
          visibility: dto.visibility,
          idInspiredByPlan: dto.inspiredByPlanId ?? null,
          composerRequestId: dto.requestId,
          estimatedTotalCost: 0,
          estimatedTotalCostMax: 0,
          estimatedTotalDuration: 0,
        });

      if (dto.stops.some((stop) => stop.detailId !== undefined)) {
        throw new BadRequestException({
          code: 'INVALID_NEW_PLAN_DETAIL_REFERENCE',
          message: 'A new plan cannot reference existing itinerary stops',
        });
      }
      if (existing) await this.assertComposerEditable(plan, manager);
      if (dto.inspiredByPlanId !== undefined) {
        const inspiration = await manager.findOne(Plan, {
          where: { id: dto.inspiredByPlanId },
          relations: { status: true, user: { status: true } },
        });
        if (
          !inspiration ||
          inspiration.id === plan.id ||
          inspiration.kind !== PlanKind.Authored ||
          inspiration.visibility !== PlanVisibility.Public ||
          inspiration.communityStatus !== ContentStatus.Published ||
          inspiration.status.key === 'cancelled' ||
          inspiration.user?.status?.key !== 'active'
        ) {
          throw new BadRequestException({
            code: 'INSPIRATION_NOT_AVAILABLE',
            message: 'The plan used as inspiration is not publicly available',
          });
        }
        plan.idInspiredByPlan = inspiration.id;
      }
      this.assertCanPublish(plan, dto.visibility);
      plan.title = dto.title;
      plan.description = dto.description ?? null;
      plan.peopleCount = dto.peopleCount;
      plan.visibility = dto.visibility;
      plan.composerRequestId = dto.requestId;
      await manager.save(plan);

      const previousDetails = await manager.find(PlanDetail, {
        where: { idPlan: plan.id },
      });
      const previousByTarget = new Map(
        previousDetails.map((detail) => [detailTargetKey(detail), detail]),
      );
      if (previousDetails.length > 0) {
        await manager.softRemove(previousDetails);
      }
      const retainedForRetry = new Map<number, PlanDetail>();
      const retryStops = dto.stops.map((stop) => {
        const previous = previousByTarget.get(
          stopTargetKey(composerStopTarget(stop)),
        );
        if (previous) retainedForRetry.set(previous.id, previous);
        return previous ? { ...stop, detailId: previous.id } : stop;
      });
      await this.applyComposerStops(
        plan,
        retryStops,
        manager,
        retainedForRetry,
      );
      await this.recalculateTotals(plan, manager);
      await this.audit(
        manager,
        idUser,
        existing ? AuditAction.Update : AuditAction.Create,
        'plan',
        plan.id,
        {
          title: plan.title,
          description: plan.description,
          peopleCount: plan.peopleCount,
          visibility: plan.visibility,
          stops: dto.stops.map((stop) =>
            stopTargetKey(composerStopTarget(stop)),
          ),
        },
      );
      return this.toOwnPlanDetail(
        await this.findOwnPlan(idUser, plan.id, manager),
      );
    });
  }

  /** Reconciles a full ordered itinerary while keeping retained PlanDetail
   * IDs and their saved economic/duration snapshots intact. */
  async updateFromComposer(
    idUser: number,
    id: number,
    dto: UpdatePlanComposerDto,
  ): Promise<OwnPlanDetailDto> {
    return this.dataSource.transaction(async (manager) => {
      const plan = await this.lockOwnPlan(idUser, id, manager);
      await this.assertComposerEditable(plan, manager);

      const requestHash = this.composerRequestHash(dto);
      if (plan.composerUpdateRequestId === dto.requestId) {
        if (plan.composerUpdateRequestHash !== requestHash) {
          throw new ConflictException({
            code: 'PLAN_COMPOSER_REQUEST_REUSED',
            message:
              'This save request was already used for different plan data',
          });
        }
        return this.toOwnPlanDetail(
          await this.findOwnPlan(idUser, id, manager),
        );
      }

      this.assertCanPublish(plan, dto.visibility);
      const original = {
        title: plan.title,
        description: plan.description,
        peopleCount: plan.peopleCount,
        visibility: plan.visibility,
      };
      plan.title = dto.title;
      plan.description = dto.description ?? null;
      plan.peopleCount = dto.peopleCount;
      plan.visibility = dto.visibility;
      plan.composerUpdateRequestId = dto.requestId;
      plan.composerUpdateRequestHash = requestHash;

      const existingDetails = await manager.find(PlanDetail, {
        where: { idPlan: id },
      });
      const detailsById = new Map(
        existingDetails.map((detail) => [detail.id, detail]),
      );
      const retained = new Map<number, PlanDetail>();
      const seenTargets = new Set<string>();
      for (const stop of dto.stops) {
        const key = stopTargetKey(composerStopTarget(stop));
        if (seenTargets.has(key)) {
          throw new BadRequestException({
            code: 'DUPLICATE_ACTIVITY_IN_PLAN',
            message: 'An activity can only appear once in the itinerary',
          });
        }
        seenTargets.add(key);
        if (stop.detailId !== undefined) {
          const detail = detailsById.get(stop.detailId);
          if (!detail || detailTargetKey(detail) !== key) {
            throw new BadRequestException({
              code: 'INVALID_PLAN_DETAIL_REFERENCE',
              message:
                'An existing itinerary stop does not belong to this plan',
            });
          }
          retained.set(detail.id, detail);
        }
      }

      // Soft-delete active rows first to free the partial unique (plan, order)
      // index while preserving row IDs and snapshots through the reorder.
      const now = new Date();
      for (const detail of existingDetails) {
        await manager.update(PlanDetail, { id: detail.id }, { deletedAt: now });
      }
      await manager.save(plan);
      await this.applyComposerStops(plan, dto.stops, manager, retained);
      await this.recalculateTotals(plan, manager);
      await this.audit(manager, idUser, AuditAction.Update, 'plan', id, {
        ...original,
        title: plan.title,
        description: plan.description,
        peopleCount: plan.peopleCount,
        visibility: plan.visibility,
        retainedDetailIds: [...retained.keys()],
        stops: dto.stops.map((stop) => stopTargetKey(composerStopTarget(stop))),
      });
      return this.toOwnPlanDetail(await this.findOwnPlan(idUser, id, manager));
    });
  }

  /** Moves an authored plan to another status (MCP loader). Audited. */
  async setStatus(
    idUser: number,
    id: number,
    statusKey: string,
  ): Promise<OwnPlanDetailDto> {
    return this.dataSource.transaction(async (manager) => {
      const plan = await this.lockOwnPlan(idUser, id, manager);
      const status = await this.findStatusByKey(manager, statusKey);
      if (plan.idPlanStatus !== status.id) {
        const original = plan.idPlanStatus;
        plan.idPlanStatus = status.id;
        await manager.update(Plan, { id }, { idPlanStatus: status.id });
        await this.audit(manager, idUser, AuditAction.Update, 'plan', id, {
          idPlanStatus: { original, current: status.id },
        });
      }
      return this.toOwnPlanDetail(await this.findOwnPlan(idUser, id, manager));
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
      // Per-person amounts scale with the party size, so totals follow it.
      if (
        dto.peopleCount !== undefined &&
        dto.peopleCount !== original.peopleCount
      ) {
        await this.recalculateTotals(plan, manager);
      }
      await this.audit(manager, idUser, AuditAction.Update, 'plan', id, {
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
      await this.audit(manager, idUser, AuditAction.Delete, 'plan', id, {
        status: 'cancelled',
      });
    });
  }

  /**
   * The author publishes a plan so others can find it and do it, or makes it
   * private again (#98). Outings already copied from it are unaffected.
   * An empty plan cannot be published: there would be nothing to do.
   */
  async setVisibility(
    idUser: number,
    id: number,
    visibility: PlanVisibility,
  ): Promise<OwnPlanDetailDto> {
    return this.dataSource.transaction(async (manager) => {
      const plan = await this.lockOwnPlan(idUser, id, manager);
      await this.assertMutable(plan, manager);
      if (plan.visibility !== visibility) {
        this.assertCanPublish(plan, visibility);
        if (visibility === PlanVisibility.Public) {
          const activityCount = await manager.count(PlanDetail, {
            where: { idPlan: id },
          });
          if (activityCount === 0) {
            throw new ConflictException({
              code: 'PLAN_EMPTY',
              message: 'A plan needs at least one activity to be published',
            });
          }
        }
        const original = plan.visibility;
        plan.visibility = visibility;
        await manager.save(plan);
        await this.audit(manager, idUser, AuditAction.Update, 'plan', id, {
          visibility: { original, current: visibility },
        });
      }
      return this.toOwnPlanDetail(await this.findOwnPlan(idUser, id, manager));
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
      this.assertPlanEligible(activity);

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
          ...snapshotValues(activity),
          estimatedDuration: activity.estimatedDuration,
          note: null,
        }),
      );
      await this.recalculateTotals(plan, manager);
      await this.audit(
        manager,
        idUser,
        AuditAction.Create,
        'plan_detail',
        detail.id,
        {
          planId: id,
          activityId: activity.id,
        },
      );
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
      // Same rule as publishing: a published plan always has something to
      // do. The author makes it private first to empty it (#98).
      if (
        plan.visibility === PlanVisibility.Public &&
        (await manager.count(PlanDetail, { where: { idPlan: id } })) === 1
      ) {
        throw new ConflictException({
          code: 'PLAN_EMPTY',
          message:
            'A published plan needs at least one activity; make it private to remove the last one',
        });
      }

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
      await this.audit(
        manager,
        idUser,
        AuditAction.Delete,
        'plan_detail',
        detailId,
        {
          planId: id,
          activityId: detail.idActivity,
        },
      );
    });
  }

  async search(
    query: PlanSearchQueryDto,
    viewerUserId: number | null = null,
  ): Promise<PaginatedResponse<PlanSummaryDto>> {
    const sortBy =
      (query.sortBy as PlanSortField | undefined) ?? PlanSortField.RELEVANCE;
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
    viewerUserId: number | null,
  ): Promise<PlanDetailResponseDto> {
    const plan = await this.plans.findOne({
      where: { id },
      relations: {
        status: true,
        inspiredByPlan: { status: true, user: { status: true } },
        details: {
          activity: {
            categories: { category: { status: true } },
            places: {
              place: { department: { city: { country: true } } },
            },
            ratings: true,
          },
          place: { department: true },
        },
      },
    });

    // A plan the viewer may not read answers exactly like a missing one, so
    // its id reveals nothing (#98).
    if (!plan || !canViewerReadPlan(this.accessFacts(plan), viewerUserId)) {
      throw new NotFoundException({
        code: 'PLAN_NOT_FOUND',
        message: 'El plan solicitado no existe',
      });
    }

    // Someone opening a shared link without a session has no outings yet.
    const activeOutingId =
      viewerUserId === null
        ? null
        : await this.findActiveOutingId(plan.id, viewerUserId);
    const viewerPlanState: ViewerPlanState = !canViewerActOnPlan(
      this.accessFacts(plan),
      viewerUserId,
    )
      ? 'view-only'
      : activeOutingId !== null
        ? 'selected'
        : 'selectable';

    const details = [...plan.details]
      .sort((left, right) => left.order - right.order)
      .map((detail) => {
        const activity = detail.activity;
        const scores = activity ? publicRatingScores(activity.ratings) : [];
        const averageRating =
          scores.length === 0
            ? 0
            : scores.reduce((total, score) => total + score, 0) / scores.length;

        return {
          id: detail.id,
          order: detail.order,
          estimatedCost: detail.estimatedCost,
          price: toPriceDto(detail),
          ...(detail.perPersonCost != null
            ? { perPersonCost: detail.perPersonCost }
            : {}),
          estimatedDuration: detail.estimatedDuration,
          stop: stopOf(detail),
          activity: activity
            ? {
                id: activity.id,
                name: activity.name,
                description: activity.description,
                estimatedCost: legacyEstimatedCost(activity),
                price: toPriceDto(activity),
                estimatedDuration: activity.estimatedDuration,
                type: activity.type,
                averageRating: this.round(averageRating),
                ratingCount: scores.length,
                categories: activity.categories
                  .filter(({ category }) => category.status.key === 'active')
                  .map(({ category }) => ({
                    id: category.id,
                    name: category.name,
                  }))
                  .sort((left, right) => left.name.localeCompare(right.name)),
                locations: activity.places.map((location) => ({
                  id: location.id,
                  latitude: location.latitude,
                  longitude: location.longitude,
                  notes: location.notes,
                  googlePlaceId: location.place.googlePlaceId,
                  externalRating: visibleExternalRating(location.place),
                  externalPrice: visibleExternalPrice(location.place),
                  place: {
                    id: location.place.id,
                    name: location.place.name,
                    description: location.place.description,
                    address: location.place.address,
                    kind: location.place.kind,
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
              }
            : null,
        };
      });

    const allScores = plan.details.flatMap((detail) =>
      detail.activity ? publicRatingScores(detail.activity.ratings) : [],
    );
    const averageRating =
      allScores.length === 0
        ? 0
        : allScores.reduce((total, score) => total + score, 0) /
          allScores.length;
    const categoryMap = new Map<number, string>();
    plan.details.forEach((detail) =>
      detail.activity?.categories
        .filter(({ category }) => category.status.key === 'active')
        .forEach(({ category }) => categoryMap.set(category.id, category.name)),
    );
    // A place-action stop contributes the categories its kind belongs to.
    const kindCategoryNames = plan.details.flatMap((detail) =>
      detail.activity ? [] : categoriesOfPlaceKind(detail.place?.kind),
    );
    if (kindCategoryNames.length) {
      const kindCategories = await this.dataSource
        .getRepository(Category)
        .find({ where: { name: In([...new Set(kindCategoryNames)]) } });
      kindCategories.forEach((category) =>
        categoryMap.set(category.id, category.name),
      );
    }

    const images = await this.media.list(
      'plan',
      plan.id,
      viewerUserId ?? undefined,
    );
    const imageUrl = await this.planImageUrl(plan.id);
    return {
      id: plan.id,
      title: plan.title,
      description: plan.description,
      ...planPriceSummary(plan),
      estimatedTotalDuration: plan.estimatedTotalDuration,
      activityCount: details.length,
      averageRating: this.round(averageRating),
      distanceKm: null,
      categories: [...categoryMap.entries()]
        .map(([categoryId, name]) => ({ id: categoryId, name }))
        .sort((left, right) => left.name.localeCompare(right.name)),
      activityNames: details.map((detail) => detail.stop.label),
      imageUrl,
      imageSource: imageSourceOf(imageUrl),
      images,
      startsAt: plan.startsAt ?? null,
      insight: insightOf(plan.rankingMeta),
      readiness: computePlanReadiness(
        plan.details,
        plan.peopleCount,
        stopName,
        insightOf(plan.rankingMeta)?.missingExperiences ?? [],
      ),
      peopleCount: plan.peopleCount,
      status: { key: plan.status.key, name: plan.status.name },
      viewerPlanState,
      activeOutingId,
      kind: plan.kind,
      visibility: plan.visibility,
      inspiredBy:
        plan.inspiredByPlan &&
        plan.inspiredByPlan.communityStatus === ContentStatus.Published &&
        canViewerReadPlan(
          this.accessFacts(plan.inspiredByPlan),
          viewerUserId,
        ) &&
        plan.inspiredByPlan.user?.status?.key === 'active'
          ? {
              id: plan.inspiredByPlan.id,
              title: plan.inspiredByPlan.title,
              creatorUsername: plan.inspiredByPlan.user?.username ?? null,
            }
          : null,
      ownedByViewer: plan.idUser === viewerUserId,
      details,
    };
  }

  /**
   * The viewer's outing still to do that was copied from `sourcePlanId`, if
   * any (CU22). Backed by `IDX_plan_active_outing_unique`, so there is at
   * most one.
   */
  async findActiveOutingId(
    sourcePlanId: number,
    viewerUserId: number,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<number | null> {
    const outing = await manager.findOne(Plan, {
      select: { id: true },
      where: {
        kind: PlanKind.Outing,
        idSourcePlan: sourcePlanId,
        idUser: viewerUserId,
        completedAt: IsNull(),
      },
    });
    return outing?.id ?? null;
  }

  /** The fields `plan-selectability.ts` decides access from. */
  accessFacts(plan: Plan): PlanAccessFacts {
    return {
      kind: plan.kind,
      visibility: plan.visibility,
      ownerId: plan.idUser,
      statusKey: plan.status.key,
    };
  }

  private async findOwnPlan(
    idUser: number,
    id: number,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<Plan> {
    const plan = await manager.findOne(Plan, {
      where: { id, idUser, kind: PlanKind.Authored },
      relations: {
        status: true,
        details: { activity: true, place: { department: true } },
      },
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
      .andWhere('plan.kind = :kind', { kind: PlanKind.Authored })
      .getOne();
    if (!plan) this.throwPlanNotFound();
    return plan;
  }

  /**
   * A plan an administrator took down after a report (SmartPlan-front#156)
   * stays its author's, but cannot be published again.
   */
  private assertCanPublish(plan: Plan, visibility: PlanVisibility): void {
    if (
      visibility === PlanVisibility.Public &&
      plan.communityStatus === ContentStatus.Removed
    ) {
      throw new ConflictException({
        code: 'PLAN_REMOVED_BY_MODERATION',
        message: 'This plan was removed by moderation and cannot be published',
      });
    }
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
    // Totals come from the saved price snapshots, never from the activities'
    // current prices, so a later price edit cannot rewrite a saved plan.
    const details = await manager.find(PlanDetail, {
      where: { idPlan: plan.id },
    });
    const totals = computePlanTotals(details, plan.peopleCount);
    plan.estimatedTotalCost = totals.totalMin;
    plan.estimatedTotalCostMax = totals.totalMax;
    plan.unpricedCount = totals.unpricedCount;
    plan.priceCompleteness = totals.completeness;
    plan.estimatedTotalDuration = details.reduce(
      (sum, detail) => sum + detail.estimatedDuration,
      0,
    );
    await manager.save(plan);
  }

  private async applyComposerStops(
    plan: Plan,
    stops: PlanComposerStopDto[],
    manager: EntityManager,
    retained: Map<number, PlanDetail>,
  ): Promise<void> {
    const targets = stops.map((stop) => composerStopTarget(stop));
    const keys = targets.map(stopTargetKey);
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException({
        code: 'DUPLICATE_ACTIVITY_IN_PLAN',
        message: 'An activity can only appear once in the itinerary',
      });
    }
    const fresh = targets.filter(
      (_, index) => stops[index].detailId === undefined,
    );
    const newActivityIds = [
      ...new Set(
        fresh.flatMap((target) =>
          target.kind === 'activity' ? [target.activityId] : [],
        ),
      ),
    ];
    const activities = newActivityIds.length
      ? await manager.find(Activity, { where: { id: In(newActivityIds) } })
      : [];
    activities.forEach((activity) => this.assertPlanEligible(activity));
    const activitiesById = new Map(
      activities.map((activity) => [activity.id, activity]),
    );
    if (activitiesById.size !== newActivityIds.length)
      this.throwActivityNotFound();

    const newPlaceIds = [
      ...new Set(
        fresh.flatMap((target) =>
          target.kind === 'place' ? [target.placeId] : [],
        ),
      ),
    ];
    const places = newPlaceIds.length
      ? await manager.find(Place, { where: { id: In(newPlaceIds) } })
      : [];
    const placesById = new Map(places.map((place) => [place.id, place]));

    for (const [index, stop] of stops.entries()) {
      const target = targets[index];
      if (stop.detailId !== undefined) {
        const detail = retained.get(stop.detailId);
        if (!detail || detailTargetKey(detail) !== keys[index]) {
          throw new BadRequestException({
            code: 'INVALID_PLAN_DETAIL_REFERENCE',
            message: 'An existing itinerary stop does not belong to this plan',
          });
        }
        detail.order = index + 1;
        detail.deletedAt = null;
        await manager.save(detail);
        continue;
      }

      if (target.kind === 'place') {
        const place = placesById.get(target.placeId);
        const intrinsic = place
          ? plannablePlaceAction(place.kind, target.action)
          : null;
        if (
          !place ||
          place.status !== 'published' ||
          !place.discoverable ||
          !intrinsic
        ) {
          throw new UnprocessableEntityException({
            code: 'PLACE_ACTION_NOT_PLANNABLE',
            message: 'That place cannot be a stop for that action',
          });
        }
        await manager.save(
          manager.create(PlanDetail, {
            idPlan: plan.id,
            idActivity: null,
            idPlace: place.id,
            action: intrinsic.action,
            order: index + 1,
            ...snapshotValues(placeActionPrice(intrinsic)),
            estimatedDuration: intrinsic.durationMinutes,
            note: null,
          }),
        );
        continue;
      }

      const activity = activitiesById.get(target.activityId);
      if (!activity) this.throwActivityNotFound();
      await manager.save(
        manager.create(PlanDetail, {
          idPlan: plan.id,
          idActivity: activity.id,
          order: index + 1,
          ...snapshotValues(activity),
          estimatedDuration: activity.estimatedDuration,
          note: null,
        }),
      );
    }
  }

  private async assertComposerEditable(
    plan: Plan,
    manager: EntityManager,
  ): Promise<void> {
    await this.assertMutable(plan, manager);
    const status = await manager.findOne(PlanStatus, {
      where: { id: plan.idPlanStatus },
    });
    if (
      plan.kind !== PlanKind.Authored ||
      plan.idPlanRequest !== null ||
      status?.key !== 'confirmed'
    ) {
      throw new ConflictException({
        code: 'PLAN_NOT_EDITABLE_IN_COMPOSER',
        message:
          'Only manually created plans can be edited with the plan composer',
      });
    }
  }

  private composerRequestHash(dto: UpdatePlanComposerDto): string {
    const payload = {
      title: dto.title,
      description: dto.description ?? null,
      peopleCount: dto.peopleCount,
      visibility: dto.visibility,
      stops: dto.stops.map((stop) => ({
        detailId: stop.detailId ?? null,
        target: stopTargetKey(composerStopTarget(stop)),
      })),
    };
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private toOwnPlanSummary(plan: Plan): OwnPlanSummaryDto {
    return {
      id: plan.id,
      title: plan.title,
      description: plan.description,
      ...planPriceSummary(plan),
      estimatedTotalDuration: plan.estimatedTotalDuration,
      peopleCount: plan.peopleCount,
      estimatedCostPerPerson: costPerPerson(
        plan.estimatedTotalCost,
        plan.peopleCount,
      ),
      activityCount: plan.details?.length ?? 0,
      status: { key: plan.status.key, name: plan.status.name },
      visibility: plan.visibility,
      inspiredByPlanId: plan.idInspiredByPlan ?? null,
      removedByModeration: plan.communityStatus === ContentStatus.Removed,
      completedAt: plan.completedAt,
      // This projection lists authored plans only. Experience feedback is
      // submitted against completed outings, so it is unavailable here.
      feedbackState: 'not_available',
      feedback: null,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
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
          price: toPriceDto(detail),
          ...(detail.perPersonCost != null
            ? { perPersonCost: detail.perPersonCost }
            : {}),
          estimatedDuration: detail.estimatedDuration,
          stop: stopOf(detail),
          activity: detail.activity
            ? {
                id: detail.activity.id,
                name: detail.activity.name,
                description: detail.activity.description,
                estimatedCost: legacyEstimatedCost(detail.activity),
                price: toPriceDto(detail.activity),
                estimatedDuration: detail.activity.estimatedDuration,
                type: detail.activity.type,
              }
            : null,
        })),
    };
  }

  private async audit(
    manager: EntityManager,
    actorId: number,
    action: AuditAction,
    affectedEntity: 'plan' | 'plan_detail',
    affectedEntityId: number,
    changes: Record<string, unknown>,
  ): Promise<void> {
    await manager.save(
      manager.create(AuditLog, {
        action,
        idActor: actorId,
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

  /**
   * Only published, plan-eligible activities can be added to a plan. Stops a
   * plan already has are not re-judged: an activity that later stops being
   * eligible stays in the plans that saved it.
   */
  private assertPlanEligible(activity: Activity): void {
    if (
      activity.status !== 'published' ||
      !activity.discoverable ||
      !activity.planEligible
    ) {
      throw new ConflictException({
        code: 'ACTIVITY_NOT_PLAN_ELIGIBLE',
        message: 'The activity cannot be added to a plan right now',
      });
    }
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
      .addSelect('plan.estimatedTotalCostMax', 'estimatedTotalCostMax')
      .addSelect('plan.unpricedCount', 'unpricedCount')
      .addSelect('plan.priceCompleteness', 'priceCompleteness')
      .addSelect('plan.estimatedTotalDuration', 'estimatedTotalDuration')
      .addSelect(PLAN_AVERAGE_RATING_SQL, 'averageRating')
      .addSelect(PLAN_CATEGORY_JSON_SQL, 'categories')
      .addSelect(PLAN_ACTIVITY_NAMES_SQL, 'activityNames')
      .addSelect(PLAN_IMAGE_URL_SQL, 'imageUrl')
      .addSelect('status.key', 'statusKey')
      .addSelect('status.name', 'statusName')
      .addSelect(PLAN_VIEWER_STATE_SQL, 'viewerPlanState')
      .addSelect(PLAN_ACTIVE_OUTING_ID_SQL, 'activeOutingId')
      .setParameter('viewerUserId', viewerUserId)
      .where('plan.deletedAt IS NULL')
      // Exploration shows only what authors published (CU12, #98); the
      // administration listing explains the same rule (#160).
      .andWhere('plan.kind = :authoredKind', {
        authoredKind: EXPLORE_LISTING.kind,
      })
      .andWhere('plan.visibility = :publicVisibility', {
        publicVisibility: EXPLORE_LISTING.visibility,
      })
      .andWhere('status.key <> :cancelledStatus', {
        cancelledStatus: EXPLORE_LISTING.excludedStatusKey,
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
        builder.orderBy('plan.estimatedTotalCost', direction, 'NULLS LAST');
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
      estimatedTotalCost:
        row.estimatedTotalCost === null ? null : Number(row.estimatedTotalCost),
      estimatedTotalCostMax:
        row.estimatedTotalCostMax === null
          ? null
          : Number(row.estimatedTotalCostMax),
      unpricedCount: Number(row.unpricedCount),
      priceCompleteness: row.priceCompleteness,
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
      imageUrl: row.imageUrl,
      imageSource: imageSourceOf(row.imageUrl),
      status: { key: row.statusKey, name: row.statusName },
      viewerPlanState: row.viewerPlanState,
      activeOutingId:
        row.activeOutingId === null ? null : Number(row.activeOutingId),
    };
  }

  async planImageUrl(id: number): Promise<string | null> {
    const rows = await this.dataSource.query<{ imageUrl: string | null }[]>(
      `SELECT ${PLAN_IMAGE_URL_SQL} AS "imageUrl" FROM "plan" "plan" WHERE "plan"."id" = $1`,
      [id],
    );
    return rows[0]?.imageUrl ?? null;
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
