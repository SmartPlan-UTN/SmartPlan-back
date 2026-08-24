import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Feedback } from '../recommendation/entities/feedback.entity';
import { Plan } from './entities/plan.entity';
import { CreateFeedbackDto } from './dto/create-feedback.dto';

@Injectable()
export class FeedbackService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Submits experience feedback for a completed plan (CU23). Always
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
  ): Promise<Feedback> {
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

    if (plan.status.key !== 'completed') {
      throw new ConflictException({
        code: 'FEEDBACK_NOT_YET_AVAILABLE',
        message: 'Feedback can only be submitted for a completed plan',
      });
    }

    const pendingStatusId = await this.feedbackStatusIdByKey('pending');
    const feedbackRepository = this.dataSource.getRepository(Feedback);

    try {
      return await feedbackRepository.save(
        feedbackRepository.create({
          idPlan: planId,
          idFeedbackStatus: pendingStatusId,
          rating: dto.rating,
          tags: dto.tags ?? [],
          comment: dto.comment ?? null,
          actualCost: dto.actualCost ?? null,
          actualDuration: dto.actualDuration ?? null,
        }),
      );
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
