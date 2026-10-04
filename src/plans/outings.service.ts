import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Brackets,
  DataSource,
  EntityManager,
  In,
  SelectQueryBuilder,
} from 'typeorm';
import {
  createPaginatedResponse,
  PaginatedResponse,
} from '../common/pagination/paginated-response';
import { Plan, PlanKind } from './entities/plan.entity';
import { PlanStatus } from './entities/plan-status.entity';
import { ListOutingsQueryDto } from './dto/list-outings-query.dto';
import {
  OutingCreationDto,
  OutingDetailDto,
  OutingSummaryDto,
} from './dto/outing-response.dto';
import { toPlanFeedbackDto } from './dto/plan-feedback.dto';
import type { FeedbackState } from './dto/plan-feedback.dto';
import {
  canViewerActOnPlan,
  canViewerReadPlan,
  hasCommunity,
} from './plan-selectability';
import { PlansService } from './plans.service';
import { MediaService } from '../media/media.service';

/** Where SmartPlan's people live: date filters use their calendar days. */
const OUTINGS_TIME_ZONE = 'America/Argentina/Mendoza';

/** Makes `%`, `_` and `\\` in a search match themselves in `ILIKE`. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * "Mis salidas" (#98): the plans a person chose to do (CU22), each one a
 * frozen copy (`kind = 'outing'`) with its own lifecycle and feedback (CU23).
 *
 * Copying on selection is what keeps a person's outing stable: the author can
 * edit, unpublish, or cancel the original afterwards and the copy does not
 * change, while whoever chooses the plan later gets the edited version.
 */
@Injectable()
export class OutingsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly plans: PlansService,
    private readonly media: MediaService,
  ) {}

  /**
   * "Lo voy a hacer". Idempotent while the outing is still to do: a double
   * click, a retry, or a concurrent request returns the same outing
   * (`created: false`) instead of a duplicate.
   */
  async create(
    userId: number,
    sourcePlanId: number,
  ): Promise<OutingCreationDto> {
    const { outingId, created } = await this.dataSource.transaction(
      async (manager) => {
        const source = await manager.findOne(Plan, {
          where: { id: sourcePlanId },
          relations: { status: true },
        });
        if (
          !source ||
          !canViewerReadPlan(this.plans.accessFacts(source), userId)
        ) {
          throw new NotFoundException({
            code: 'PLAN_NOT_FOUND',
            message: 'The requested plan does not exist',
          });
        }
        if (!canViewerActOnPlan(this.plans.accessFacts(source), userId)) {
          throw new ConflictException({
            code: 'PLAN_NOT_ACTIONABLE',
            message: 'This plan cannot be chosen as an outing',
          });
        }
        return this.copyAsOuting(manager, userId, source.id, source.id);
      },
    );
    return { created, outing: await this.findOne(userId, outingId) };
  }

  /**
   * "Volver a hacer este plan". Copies the original again when the person can
   * still choose it, so they get its current version; otherwise the outing's
   * own frozen itinerary. Earlier outings and their feedback stay untouched.
   */
  async repeat(userId: number, outingId: number): Promise<OutingCreationDto> {
    const { outingId: newOutingId, created } =
      await this.dataSource.transaction(async (manager) => {
        const outing = await this.findOwnOuting(manager, userId, outingId);
        const source = outing.idSourcePlan
          ? await manager.findOne(Plan, {
              where: { id: outing.idSourcePlan },
              relations: { status: true },
            })
          : null;
        const copyFrom =
          source && canViewerActOnPlan(this.plans.accessFacts(source), userId)
            ? source.id
            : outing.id;
        return this.copyAsOuting(
          manager,
          userId,
          copyFrom,
          outing.idSourcePlan,
        );
      });
    return { created, outing: await this.findOne(userId, newOutingId) };
  }

  async list(
    userId: number,
    query: ListOutingsQueryDto,
  ): Promise<PaginatedResponse<OutingSummaryDto>> {
    const [page, total] = await this.filteredOutings(userId, query)
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    const ids = page.map((outing) => outing.id);
    const loaded =
      ids.length === 0
        ? []
        : await this.dataSource.getRepository(Plan).find({
            where: { id: In(ids) },
            relations: {
              details: { activity: true },
              feedback: true,
              sourcePlan: { status: true },
            },
          });
    const byId = new Map(loaded.map((outing) => [outing.id, outing]));
    const outings = ids
      .map((id) => byId.get(id))
      .filter((outing): outing is Plan => outing != null);
    const summaries = await Promise.all(
      outings.map(async (outing) => {
        const summary = this.toSummary(outing, userId);
        summary.imageUrl = await this.plans.planImageUrl(outing.id);
        if (summary.feedback) {
          summary.feedback.images = await this.media.list(
            'feedback',
            summary.feedback.id,
            userId,
          );
        }
        return summary;
      }),
    );
    return createPaginatedResponse(summaries, total, query.page, query.limit);
  }

  /**
   * The caller's outings matching the "Mis salidas" filters (#134), ordered,
   * selecting only ids so the page is cut before loading any relation.
   */
  private filteredOutings(
    userId: number,
    query: ListOutingsQueryDto,
  ): SelectQueryBuilder<Plan> {
    // The date an outing is filed under: when it was done, else when chosen.
    const dateColumn =
      query.status === 'completed'
        ? '"plan"."completed_at"'
        : query.status === 'to_do'
          ? '"plan"."created_at"'
          : 'COALESCE("plan"."completed_at", "plan"."created_at")';
    const builder = this.dataSource
      .getRepository(Plan)
      .createQueryBuilder('plan')
      .select('plan.id')
      .where('plan.idUser = :userId', { userId })
      .andWhere('plan.kind = :kind', { kind: PlanKind.Outing });

    if (query.status === 'to_do') builder.andWhere('plan.completedAt IS NULL');
    if (query.status === 'completed') {
      builder.andWhere('plan.completedAt IS NOT NULL');
    }

    if (query.search) {
      builder.andWhere(
        new Brackets((match) => {
          match.where('plan.title ILIKE :search').orWhere(
            `EXISTS (
               SELECT 1 FROM "plan_detail" "searchDetail"
               JOIN "activity" "searchActivity"
                 ON "searchActivity"."id" = "searchDetail"."id_activity"
               WHERE "searchDetail"."id_plan" = "plan"."id"
                 AND "searchDetail"."deleted_at" IS NULL
                 AND "searchActivity"."name" ILIKE :search
             )`,
          );
        }),
        { search: `%${escapeLike(query.search)}%` },
      );
    }

    // Calendar days as people in Mendoza see them, both ends inclusive.
    const localDay = `(${dateColumn} AT TIME ZONE '${OUTINGS_TIME_ZONE}')::date`;
    if (query.from) {
      builder.andWhere(`${localDay} >= :from::date`, { from: query.from });
    }
    if (query.to) {
      builder.andWhere(`${localDay} <= :to::date`, { to: query.to });
    }

    if (query.rated !== undefined) {
      builder.andWhere(
        `${query.rated ? '' : 'NOT '}EXISTS (
           SELECT 1 FROM "feedback" "ratedFeedback"
           WHERE "ratedFeedback"."id_plan" = "plan"."id"
             AND "ratedFeedback"."deleted_at" IS NULL
         )`,
      );
    }

    // Default: the most recently done (or chosen) first. `id` breaks ties so
    // pages are stable.
    switch (query.sort ?? 'recent') {
      case 'oldest':
        return builder.orderBy(dateColumn, 'ASC').addOrderBy('plan.id', 'ASC');
      case 'cost_desc':
        return builder
          .orderBy('plan.estimatedTotalCost', 'DESC')
          .addOrderBy('plan.id', 'DESC');
      case 'cost_asc':
        return builder
          .orderBy('plan.estimatedTotalCost', 'ASC')
          .addOrderBy('plan.id', 'ASC');
      default:
        return builder
          .orderBy(dateColumn, 'DESC')
          .addOrderBy('plan.id', 'DESC');
    }
  }

  async findOne(userId: number, outingId: number): Promise<OutingDetailDto> {
    const outing = await this.findOwnOuting(
      this.dataSource.manager,
      userId,
      outingId,
      true,
    );
    // The itinerary with places and ratings, exactly as the plan detail
    // renders it; the outing belongs to the caller, so it is readable.
    const { details } = await this.plans.findOne(outing.id, userId);
    const summary = this.toSummary(outing, userId);
    summary.imageUrl = await this.plans.planImageUrl(outing.id);
    if (summary.feedback) {
      summary.feedback.images = await this.media.list(
        'feedback',
        summary.feedback.id,
        userId,
      );
    }
    return {
      ...summary,
      travelDistanceMeters: outing.travelDistanceMeters,
      travelDurationSeconds: outing.travelDurationSeconds,
      details,
    };
  }

  /**
   * "Marcar como realizada". Opens the feedback immediately (CU23) and never
   * touches the original plan or anyone else's outing. Idempotent: the first
   * `completedAt` is kept.
   */
  async complete(userId: number, outingId: number): Promise<OutingDetailDto> {
    await this.dataSource.transaction(async (manager) => {
      const outing = await this.lockOwnOuting(manager, userId, outingId);
      if (outing.completedAt !== null) return;
      outing.idPlanStatus = (
        await this.findStatusByKey(manager, 'completed')
      ).id;
      outing.completedAt = new Date();
      await manager.save(outing);
    });
    return this.findOne(userId, outingId);
  }

  /**
   * Cancels an outing still to do. A completed one is history, with its
   * feedback, and stays.
   */
  async cancel(userId: number, outingId: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const outing = await this.lockOwnOuting(manager, userId, outingId);
      if (outing.completedAt !== null) {
        throw new ConflictException({
          code: 'OUTING_ALREADY_COMPLETED',
          message: 'A completed outing cannot be cancelled',
        });
      }
      await manager.softRemove(outing);
    });
  }

  /**
   * Copies plan `copyFromId` and its itinerary into a new outing of `userId`.
   * `IDX_plan_active_outing_unique` makes the insert a no-op when an outing
   * to do from `sourcePlanId` already exists; that one is returned instead.
   * Concurrent calls serialize on the index, so exactly one copy survives.
   */
  private async copyAsOuting(
    manager: EntityManager,
    userId: number,
    copyFromId: number,
    sourcePlanId: number | null,
  ): Promise<{ outingId: number; created: boolean }> {
    const toDo = await this.findStatusByKey(manager, 'confirmed');
    const inserted = await manager.query<{ id: number }[]>(
      `INSERT INTO "plan" (
         "title", "description", "id_user", "kind", "id_source_plan",
         "id_plan_status", "visibility", "estimated_total_cost",
         "estimated_total_duration", "people_count",
         "travel_distance_meters", "travel_duration_seconds"
       )
       SELECT "title", "description", $1, 'outing', $2, $3, 'private',
              "estimated_total_cost", "estimated_total_duration",
              "people_count", "travel_distance_meters",
              "travel_duration_seconds"
       FROM "plan" WHERE "id" = $4
       ON CONFLICT ("id_user", "id_source_plan")
         WHERE "kind" = 'outing' AND "completed_at" IS NULL AND "deleted_at" IS NULL
         DO NOTHING
       RETURNING "id"`,
      [userId, sourcePlanId, toDo.id, copyFromId],
    );

    if (inserted.length === 0) {
      const existing =
        sourcePlanId === null
          ? null
          : await this.plans.findActiveOutingId(sourcePlanId, userId, manager);
      if (existing === null) {
        // Only reachable if the active outing vanished between the
        // conflict and this read; the caller can simply retry.
        throw new ConflictException({
          code: 'OUTING_CONFLICT',
          message: 'The outing changed while it was being created',
        });
      }
      return { outingId: existing, created: false };
    }

    const outingId = Number(inserted[0].id);
    await manager.query(
      `INSERT INTO "plan_detail" (
         "id_plan", "id_activity", "order", "estimated_cost",
         "estimated_duration", "note"
       )
       SELECT $1, "id_activity", "order", "estimated_cost",
              "estimated_duration", "note"
       FROM "plan_detail"
       WHERE "id_plan" = $2 AND "deleted_at" IS NULL`,
      [outingId, copyFromId],
    );
    await manager.query(
      `INSERT INTO "plan_image" (
         "id_plan", "object_key", "content_type", "byte_size", "width",
         "height", "display_order", "is_primary", "is_source_copy"
       )
       SELECT $1, "object_key", "content_type", "byte_size", "width",
              "height", "display_order", "is_primary", true
       FROM "plan_image"
       WHERE "id_plan" = $2 AND "deleted_at" IS NULL`,
      [outingId, copyFromId],
    );
    return { outingId, created: true };
  }

  private toSummary(outing: Plan, userId: number): OutingSummaryDto {
    const details = [...(outing.details ?? [])].sort(
      (left, right) => left.order - right.order,
    );
    const source = outing.sourcePlan;
    return {
      id: outing.id,
      title: outing.title,
      description: outing.description,
      estimatedTotalCost: outing.estimatedTotalCost,
      estimatedTotalDuration: outing.estimatedTotalDuration,
      peopleCount: outing.peopleCount,
      estimatedCostPerPerson:
        Math.round((outing.estimatedTotalCost / outing.peopleCount) * 100) /
        100,
      activityCount: details.length,
      activityNames: details.map((detail) => detail.activity.name),
      status: outing.completedAt === null ? 'to_do' : 'completed',
      completedAt: outing.completedAt,
      feedbackState: this.feedbackState(outing),
      feedback: outing.feedback ? toPlanFeedbackDto(outing.feedback) : null,
      source: source
        ? {
            id: source.id,
            kind: source.kind,
            title: source.title,
            available: canViewerActOnPlan(
              this.plans.accessFacts(source),
              userId,
            ),
            hasCommunity: hasCommunity(this.plans.accessFacts(source)),
          }
        : null,
      createdAt: outing.createdAt,
    };
  }

  /**
   * Feedback opens the moment the outing is marked done and never closes
   * (CU23). The 24 h reminder does not change it.
   */
  private feedbackState(outing: Plan): FeedbackState {
    if (outing.feedback) return 'submitted';
    return outing.completedAt === null ? 'not_available' : 'available';
  }

  private async findOwnOuting(
    manager: EntityManager,
    userId: number,
    outingId: number,
    withSummaryRelations = false,
  ): Promise<Plan> {
    const outing = await manager.findOne(Plan, {
      where: { id: outingId, idUser: userId, kind: PlanKind.Outing },
      relations: withSummaryRelations
        ? {
            details: { activity: true },
            feedback: true,
            sourcePlan: { status: true },
          }
        : undefined,
    });
    if (!outing) this.throwOutingNotFound();
    return outing;
  }

  private async lockOwnOuting(
    manager: EntityManager,
    userId: number,
    outingId: number,
  ): Promise<Plan> {
    const outing = await manager
      .createQueryBuilder(Plan, 'plan')
      .setLock('pessimistic_write')
      .where('plan.id = :outingId', { outingId })
      .andWhere('plan.id_user = :userId', { userId })
      .andWhere('plan.kind = :kind', { kind: PlanKind.Outing })
      .getOne();
    if (!outing) this.throwOutingNotFound();
    return outing;
  }

  private async findStatusByKey(
    manager: EntityManager,
    key: string,
  ): Promise<PlanStatus> {
    const status = await manager.findOne(PlanStatus, { where: { key } });
    if (!status) {
      throw new Error(
        `Missing plan_status seed value "${key}". Run pnpm db:seed.`,
      );
    }
    return status;
  }

  private throwOutingNotFound(): never {
    throw new NotFoundException({
      code: 'OUTING_NOT_FOUND',
      message: 'The requested outing does not exist',
    });
  }
}
