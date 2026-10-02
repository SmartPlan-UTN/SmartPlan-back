import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CommunityContentStatus } from '../common/moderation/community-content-status';
import { MediaService } from '../media/media.service';
import { Feedback } from '../recommendation/entities/feedback.entity';
import { Plan, PlanKind } from './entities/plan.entity';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { PlanFeedbackDto, toPlanFeedbackDto } from './dto/plan-feedback.dto';

@Injectable()
export class FeedbackService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly media: MediaService,
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
      relations: { status: true },
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

    const pendingStatusId = await this.feedbackStatusIdByKey('pending');
    const feedbackRepository = this.dataSource.getRepository(Feedback);
    const shared = dto.shared ?? false;
    const comment = dto.comment ?? null;

    try {
      const feedback = await feedbackRepository.save(
        feedbackRepository.create({
          idPlan: planId,
          idFeedbackStatus: pendingStatusId,
          rating: dto.rating,
          tags: dto.tags ?? [],
          comment,
          actualCost: dto.actualCost ?? null,
          actualDuration: dto.actualDuration ?? null,
          isShared: shared,
          sharedAt: shared ? new Date() : null,
          commentStatus: shared ? this.publishedCommentStatus(comment) : null,
        }),
      );
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

  /**
   * Shares an outing's experience with the community, or makes it private
   * again (#106). Making it private hides it at once and deletes nothing;
   * sharing it again restores it as it was. The comment enters the
   * administrators' queue only the first time it goes public, since
   * feedback is never edited.
   */
  async setSharing(
    planId: number,
    userId: number,
    shared: boolean,
  ): Promise<PlanFeedbackDto> {
    const plan = await this.dataSource.getRepository(Plan).findOne({
      where: { id: planId },
      relations: { feedback: true },
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
    if (feedback.isShared !== shared) {
      feedback.isShared = shared;
      if (shared) {
        feedback.sharedAt = new Date();
        feedback.commentStatus ??= this.publishedCommentStatus(
          feedback.comment,
        );
      }
      await this.dataSource.getRepository(Feedback).save(feedback);
    }

    return {
      ...toPlanFeedbackDto(feedback),
      images: await this.media.list('feedback', feedback.id, userId),
    };
  }

  /**
   * There is no automatic moderation: a shared comment is public at once
   * and waits for an administrator, who may take it down. `null` when there
   * is no comment to review.
   */
  private publishedCommentStatus(
    comment: string | null,
  ): CommunityContentStatus | null {
    return comment ? CommunityContentStatus.Unreviewed : null;
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
