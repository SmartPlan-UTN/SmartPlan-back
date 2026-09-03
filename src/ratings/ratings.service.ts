import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  QueryFailedError,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { Activity } from '../activities/entities/activity.entity';
import { AuditService } from '../common/audit/audit.service';
import { AuditAction } from '../administration/entities/audit-log.entity';
import {
  createPaginatedResponse,
  PaginatedResponse,
} from '../common/pagination/paginated-response';
import { Plan } from '../plans/entities/plan.entity';
import { CreateRatingDto } from './dto/create-rating.dto';
import { DeleteAdminRatingDto } from './dto/delete-admin-rating.dto';
import { ListAdminRatingsQueryDto } from './dto/list-admin-ratings-query.dto';
import {
  ListRatingsQueryDto,
  RatingSortField,
} from './dto/list-ratings-query.dto';
import { ModerateRatingDto } from './dto/moderate-rating.dto';
import {
  AdminRatingDto,
  OwnRatingDto,
  PublicRatingDto,
  RatingSummaryDto,
} from './dto/rating-response.dto';
import { UpdateRatingDto } from './dto/update-rating.dto';
import { Rating, RatingModerationStatus } from './entities/rating.entity';
import { RatingModerationService } from './rating-moderation.service';

@Injectable()
export class RatingsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Rating)
    private readonly ratings: Repository<Rating>,
    @InjectRepository(Activity)
    private readonly activities: Repository<Activity>,
    private readonly moderation: RatingModerationService,
    private readonly auditService: AuditService,
  ) {}

  async listPublic(
    activityId: number,
    query: ListRatingsQueryDto,
  ): Promise<
    PaginatedResponse<PublicRatingDto> & { summary: RatingSummaryDto }
  > {
    await this.requireActivity(activityId);
    const builder = this.ratings
      .createQueryBuilder('rating')
      .innerJoinAndSelect('rating.user', 'user')
      .where('rating.idActivity = :activityId', { activityId })
      .andWhere('rating.moderationStatus = :status', {
        status: RatingModerationStatus.Approved,
      });
    this.applyOrdering(builder, query);
    builder.skip((query.page - 1) * query.limit).take(query.limit);

    const [ratings, total] = await builder.getManyAndCount();
    const summary = await this.summary(activityId);
    return {
      ...createPaginatedResponse(
        ratings.map((rating) => this.toPublic(rating)),
        total,
        query.page,
        query.limit,
      ),
      summary,
    };
  }

  async findOwn(
    activityId: number,
    userId: number,
  ): Promise<OwnRatingDto | null> {
    const rating = await this.ratings.findOne({
      where: { idActivity: activityId, idUser: userId },
      relations: { user: true },
    });
    return rating ? this.toOwn(rating) : null;
  }

  async create(
    activityId: number,
    userId: number,
    dto: CreateRatingDto,
  ): Promise<OwnRatingDto> {
    await this.requireActivity(activityId);
    await this.requireEligiblePlan(dto.planId, activityId, userId);
    const moderation = await this.moderation.moderate(dto.comment ?? null);
    try {
      const saved = await this.ratings.save(
        this.ratings.create({
          idActivity: activityId,
          idUser: userId,
          idPlan: dto.planId,
          score: dto.score,
          comment: dto.comment ?? null,
          moderationStatus: moderation.status,
          moderationReason: moderation.reason,
          idFeedback: null,
        }),
      );
      const rating = await this.ratings.findOneOrFail({
        where: { id: saved.id },
        relations: { user: true },
      });
      return this.toOwn(rating);
    } catch (error) {
      this.rethrowUniqueViolation(error, {
        code: 'RATING_ALREADY_EXISTS',
        message: 'You have already rated this activity',
      });
    }
  }

  async update(
    id: number,
    userId: number,
    dto: UpdateRatingDto,
  ): Promise<OwnRatingDto> {
    if (dto.score === undefined && dto.comment === undefined) {
      throw new BadRequestException({
        code: 'RATING_UPDATE_EMPTY',
        message: 'At least one rating field must be provided',
      });
    }
    const rating = await this.findOwnRating(id, userId);
    rating.score = dto.score ?? rating.score;
    if (dto.comment !== undefined) {
      const moderation = await this.moderation.moderate(dto.comment);
      rating.comment = dto.comment;
      rating.moderationStatus = moderation.status;
      rating.moderationReason = moderation.reason;
    }
    return this.toOwn(await this.ratings.save(rating));
  }

  async remove(id: number, userId: number): Promise<void> {
    await this.ratings.softRemove(await this.findOwnRating(id, userId));
  }

  async removeByAdministrator(
    id: number,
    actorId: number,
    dto: DeleteAdminRatingDto,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const rating = await manager.findOne(Rating, { where: { id } });
      if (!rating) this.throwRatingNotFound();
      await manager.softRemove(rating);
      await this.auditService.record(
        manager,
        AuditAction.Delete,
        'rating',
        id,
        { reason: dto.reason ?? null },
        actorId,
      );
    });
  }

  async listAdmin(
    query: ListAdminRatingsQueryDto,
  ): Promise<PaginatedResponse<AdminRatingDto>> {
    const builder = this.ratings
      .createQueryBuilder('rating')
      .innerJoinAndSelect('rating.user', 'user')
      .innerJoinAndSelect('rating.activity', 'activity')
      .innerJoinAndSelect('rating.plan', 'plan');
    if (query.status) {
      builder.where('rating.moderationStatus = :status', {
        status: query.status,
      });
    }
    this.applyOrdering(builder, query);
    builder.skip((query.page - 1) * query.limit).take(query.limit);
    const [ratings, total] = await builder.getManyAndCount();
    return createPaginatedResponse(
      ratings.map((rating) => this.toAdmin(rating)),
      total,
      query.page,
      query.limit,
    );
  }

  async moderate(id: number, dto: ModerateRatingDto): Promise<AdminRatingDto> {
    const rating = await this.ratings.findOne({
      where: { id },
      relations: { user: true, activity: true, plan: true },
    });
    if (!rating) this.throwRatingNotFound();
    rating.moderationStatus = dto.status;
    rating.moderationReason =
      dto.status === RatingModerationStatus.Rejected ? dto.reason! : null;
    return this.toAdmin(await this.ratings.save(rating));
  }

  private async requireActivity(id: number): Promise<void> {
    if (!(await this.activities.exists({ where: { id } }))) {
      throw new NotFoundException({
        code: 'ACTIVITY_NOT_FOUND',
        message: 'The requested activity does not exist',
      });
    }
  }

  private async requireEligiblePlan(
    planId: number,
    activityId: number,
    userId: number,
  ): Promise<void> {
    const plan = await this.dataSource.getRepository(Plan).findOne({
      where: { id: planId, idUser: userId },
      relations: { status: true, details: true },
    });
    if (!plan) {
      throw new NotFoundException({
        code: 'PLAN_NOT_FOUND',
        message: 'The requested plan does not exist',
      });
    }
    if (
      plan.status.key !== 'completed' ||
      !plan.details.some((detail) => detail.idActivity === activityId)
    ) {
      throw new ConflictException({
        code: 'RATING_EXPERIENCE_REQUIRED',
        message:
          'A completed plan containing this activity is required to create a rating',
      });
    }
  }

  private async findOwnRating(id: number, userId: number): Promise<Rating> {
    const rating = await this.ratings.findOne({
      where: { id, idUser: userId },
      relations: { user: true },
    });
    if (!rating) this.throwRatingNotFound();
    return rating;
  }

  private async summary(activityId: number): Promise<RatingSummaryDto> {
    const raw = await this.ratings
      .createQueryBuilder('rating')
      .select('COALESCE(AVG(rating.score), 0)', 'averageRating')
      .addSelect('COUNT(*)', 'ratingCount')
      .where('rating.idActivity = :activityId', { activityId })
      .andWhere('rating.moderationStatus = :status', {
        status: RatingModerationStatus.Approved,
      })
      .getRawOne<{ averageRating: string; ratingCount: string }>();
    return {
      averageRating: Math.round(Number(raw?.averageRating ?? 0) * 100) / 100,
      ratingCount: Number(raw?.ratingCount ?? 0),
    };
  }

  private applyOrdering(
    builder: SelectQueryBuilder<Rating>,
    query: ListRatingsQueryDto,
  ): void {
    const direction = query.direction.toUpperCase() as 'ASC' | 'DESC';
    const column =
      (query.sortBy ?? RatingSortField.CREATED_AT) === RatingSortField.SCORE
        ? 'rating.score'
        : 'rating.createdAt';
    builder.orderBy(column, direction).addOrderBy('rating.id', 'ASC');
  }

  private toPublic(rating: Rating): PublicRatingDto {
    return {
      id: rating.id,
      score: rating.score,
      comment: rating.comment,
      authorAlias: this.alias(rating.user.name, rating.user.lastName),
      createdAt: rating.createdAt,
      updatedAt: rating.updatedAt,
    };
  }

  private toOwn(rating: Rating): OwnRatingDto {
    return {
      ...this.toPublic(rating),
      activityId: rating.idActivity,
      planId: rating.idPlan,
      moderationStatus: rating.moderationStatus,
      moderationReason: rating.moderationReason,
    };
  }

  private toAdmin(rating: Rating): AdminRatingDto {
    return {
      ...this.toOwn(rating),
      author: {
        id: rating.user.id,
        name: rating.user.name,
        lastName: rating.user.lastName,
      },
      activity: { id: rating.activity.id, name: rating.activity.name },
      plan: { id: rating.plan.id, title: rating.plan.title },
    };
  }

  private alias(name: string, lastName: string): string {
    return `${name} ${lastName.slice(0, 1).toUpperCase()}.`;
  }

  private throwRatingNotFound(): never {
    throw new NotFoundException({
      code: 'RATING_NOT_FOUND',
      message: 'The requested rating does not exist',
    });
  }

  private rethrowUniqueViolation(
    error: unknown,
    response: { code: string; message: string },
  ): never {
    if (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string }).code === '23505'
    ) {
      throw new ConflictException(response);
    }
    throw error;
  }
}
