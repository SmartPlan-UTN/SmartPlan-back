import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  ContentStatus,
  statusAfterEdit,
} from '../common/moderation/content-status';
import { MediaService } from '../media/media.service';
import { ObservedPriceService } from '../catalog/observed-price.service';
import { Feedback } from '../recommendation/entities/feedback.entity';
import { PlanDetail } from './entities/plan-detail.entity';
import { Plan, PlanKind } from './entities/plan.entity';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { UpdateFeedbackDto } from './dto/update-feedback.dto';
import { PlanFeedbackDto, toPlanFeedbackDto } from './dto/plan-feedback.dto';
import { hasCommunity } from './plan-selectability';

@Injectable()
export class FeedbackService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly media: MediaService,
    private readonly observedPrices: ObservedPriceService,
  ) {}

  /**
   * Submits experience feedback for a completed outing (CU23): feedback is
   * about what a person actually did, so only their own outing takes it,
   * one per outing. Always
   * created as `pending` — never `processed` in the POST, since no
   * materialization pipeline consumes it yet in this scope (plan section
   * 10.1). Relies on the unconditional UNIQUE(idPlan) index (no soft-delete
   * scoping, section 10.2) for the concurrency invariant: two simultaneous
   * submissions on the same plan resolve to exactly one row, the loser
   * gets a real duplicate-key error translated into a 409 here.
   */
  async create(
    planId: number,
    userId: number,
    dto: CreateFeedbackDto,
  ): Promise<PlanFeedbackDto> {
    const plan = await this.dataSource.getRepository(Plan).findOne({
      where: { id: planId },
      relations: { status: true, sourcePlan: { status: true } },
    });

    if (!plan) {
      throw new NotFoundException({
        code: 'PLAN_NOT_FOUND',
        message: 'The requested plan does not exist',
      });
    }

    if (plan.idUser !== userId) {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message: 'You do not have permission to submit feedback for this plan',
      });
    }

    if (plan.kind !== PlanKind.Outing) {
      throw new ConflictException({
        code: 'FEEDBACK_REQUIRES_OUTING',
        message: 'Feedback is submitted on an outing, not on a plan',
      });
    }

    if (plan.status.key !== 'completed') {
      throw new ConflictException({
        code: 'FEEDBACK_NOT_YET_AVAILABLE',
        message: 'Feedback can only be submitted for a completed outing',
      });
    }

    if (dto.shared) this.assertShareable(plan);

    const pendingStatusId = await this.feedbackStatusIdByKey('pending');
    const shared = dto.shared ?? false;
    const comment = dto.comment ?? null;

    const activityCosts = await this.validCosts(planId, dto);

    try {
      const feedback = await this.dataSource.transaction(async (manager) => {
        const saved = await manager.save(
          manager.create(Feedback, {
            idPlan: planId,
            idFeedbackStatus: pendingStatusId,
            rating: dto.rating,
            tags: dto.tags ?? [],
            comment,
            actualCost: dto.actualCost ?? null,
            actualDuration: dto.actualDuration ?? null,
            actualPartySize: dto.partySize ?? null,
            isShared: shared,
            sharedAt: shared ? new Date() : null,
            commentStatus: shared ? this.publishedCommentStatus(comment) : null,
          }),
        );
        if (activityCosts.length > 0) {
          const now = new Date();
          await this.observedPrices.record(manager, {
            idFeedback: saved.id,
            partySize: dto.partySize ?? plan.peopleCount,
            observedAt: now,
            costs: activityCosts,
          });
          for (const cost of activityCosts) {
            await this.observedPrices.applyEstimate(
              manager,
              cost.activityId,
              now,
            );
          }
        }
        return saved;
      });
      return toPlanFeedbackDto(feedback);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'FEEDBACK_ALREADY_SUBMITTED',
          message: 'Feedback was already submitted for this plan',
        });
      }
      throw error;
    }
  }

  /** Per-activity costs, restricted to activities that belong to the plan. */
  private async validCosts(
    planId: number,
    dto: CreateFeedbackDto,
  ): Promise<Array<{ activityId: number; amount: number }>> {
    const costs = dto.activityCosts ?? [];
    if (costs.length === 0) return [];
    const details = await this.dataSource
      .getRepository(PlanDetail)
      .find({ where: { idPlan: planId } });
    const allowed = new Set(details.map((detail) => detail.idActivity));
    const seen = new Set<number>();
    for (const cost of costs) {
      if (!allowed.has(cost.activityId) || seen.has(cost.activityId)) {
        throw new BadRequestException({
          code: 'FEEDBACK_ACTIVITY_COST_INVALID',
          message:
            'Each reported cost must belong to a different activity of the outing',
        });
      }
      seen.add(cost.activityId);
    }
    return costs.map((cost) => ({
      activityId: cost.activityId,
      amount: cost.amount,
    }));
  }

  /**
   * Edits the existing experience without replacing its photos or other
   * fields, or shares it with the community / makes it private (#106).
   * Changing the score or comment sends it back to `pending` so the
   * recommendation model picks it up again, unless an administrator
   * discarded it (CU59): editing never lifts that decision.
   */
  async update(
    planId: number,
    userId: number,
    dto: UpdateFeedbackDto,
  ): Promise<PlanFeedbackDto> {
    if (
      dto.rating === undefined &&
      dto.comment === undefined &&
      dto.shared === undefined
    ) {
      throw new BadRequestException({
        code: 'FEEDBACK_UPDATE_EMPTY',
        message: 'At least one feedback field must be provided',
      });
    }
    const plan = await this.dataSource.getRepository(Plan).findOne({
      where: { id: planId },
      relations: { feedback: true, sourcePlan: { status: true } },
    });

    if (!plan || plan.idUser !== userId || plan.kind !== PlanKind.Outing) {
      throw new NotFoundException({
        code: 'OUTING_NOT_FOUND',
        message: 'The requested outing does not exist',
      });
    }

    if (!plan.feedback) {
      throw new NotFoundException({
        code: 'FEEDBACK_NOT_FOUND',
        message: 'This outing has no feedback to share yet',
      });
    }

    const feedback = plan.feedback;
    const shared = dto.shared;
    if (shared !== undefined && feedback.isShared !== shared) {
      if (shared) this.assertShareable(plan);
      feedback.isShared = shared;
      if (shared) {
        feedback.sharedAt = new Date();
        feedback.commentStatus ??= this.publishedCommentStatus(
          feedback.comment,
        );
      }
    }

    if (dto.rating !== undefined) feedback.rating = dto.rating;
    if (dto.comment !== undefined && dto.comment !== feedback.comment) {
      feedback.comment = dto.comment?.trim() || null;
      feedback.commentStatus = feedback.commentStatus
        ? statusAfterEdit(feedback.commentStatus)
        : feedback.isShared
          ? this.publishedCommentStatus(feedback.comment)
          : null;
    }
    if (
      (dto.rating !== undefined || dto.comment !== undefined) &&
      feedback.idFeedbackStatus !==
        (await this.feedbackStatusIdByKey('discarded'))
    ) {
      feedback.idFeedbackStatus = await this.feedbackStatusIdByKey('pending');
    }
    await this.dataSource.getRepository(Feedback).save(feedback);

    return {
      ...toPlanFeedbackDto(feedback),
      images: await this.media.list('feedback', feedback.id, userId),
    };
  }

  /**
   * Only an outing of a published plan has a community to share with. Making
   * an experience private is always allowed, even once that plan is no
   * longer published, so its author never loses control over it.
   */
  private assertShareable(outing: Plan): void {
    const source = outing.sourcePlan;
    if (
      !source ||
      !hasCommunity({
        kind: source.kind,
        visibility: source.visibility,
        statusKey: source.status.key,
      })
    ) {
      throw new ConflictException({
        code: 'EXPERIENCE_NOT_SHAREABLE',
        message: 'Only an outing of a published plan can be shared',
      });
    }
  }

  /**
   * There is no automatic moderation: a shared comment is public at once,
   * until someone reports it (SmartPlan-front#156). `null` when there is no
   * comment.
   */
  private publishedCommentStatus(comment: string | null): ContentStatus | null {
    return comment ? ContentStatus.Published : null;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: unknown }).code === '23505'
    );
  }

  private async feedbackStatusIdByKey(key: string): Promise<number> {
    const status = await this.dataSource
      .createQueryBuilder()
      .select('status.id', 'id')
      .from('feedback_status', 'status')
      .where('status.key = :key', { key })
      .getRawOne<{ id: number }>();

    if (!status) {
      throw new Error(
        `Missing feedback_status seed value "${key}". Run pnpm db:seed.`,
      );
    }

    return status.id;
  }
}
