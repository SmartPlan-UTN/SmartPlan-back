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
import {
  ListRatingsQueryDto,
  RatingSortField,
} from './dto/list-ratings-query.dto';
import {
  ContentStatus,
  publicContentSql,
  statusAfterEdit,
  viewableContentSql,
} from '../common/moderation/content-status';
import {
  OwnRatingDto,
  PublicRatingDto,
  RatingSummaryDto,
} from './dto/rating-response.dto';
import { UpdateRatingDto } from './dto/update-rating.dto';
import { Rating } from './entities/rating.entity';
import { authorAlias } from '../users/author-alias';
import { MediaService } from '../media/media.service';

@Injectable()
export class RatingsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Rating)
    private readonly ratings: Repository<Rating>,
    @InjectRepository(Activity)
    private readonly activities: Repository<Activity>,
    private readonly auditService: AuditService,
    private readonly media: MediaService,
  ) {}

  /**
   * The ratings everyone sees, plus the viewer's own one while it is under
   * review: its author keeps seeing it as before (SmartPlan-front#156).
   */
  async listPublic(
    activityId: number,
    query: ListRatingsQueryDto,
    viewerId?: number,
  ): Promise<
    PaginatedResponse<PublicRatingDto> & { summary: RatingSummaryDto }
  > {
    await this.requireActivity(activityId);
    const builder = this.ratings
      .createQueryBuilder('rating')
      .innerJoinAndSelect('rating.user', 'user')
      .where('rating.idActivity = :activityId', { activityId })
      .andWhere(viewableContentSql('rating.status', 'rating.idUser'), {
        viewerId: viewerId ?? null,
      });
    this.applyOrdering(builder, query);
    builder.skip((query.page - 1) * query.limit).take(query.limit);

    const [ratings, total] = await builder.getManyAndCount();
    const summary = await this.summary(activityId);
    const withImages = await Promise.all(
      ratings.map(async (rating) => ({
        ...this.toPublic(rating, viewerId),
        images: await this.media.list('rating', rating.id, viewerId),
      })),
    );
    return {
      ...createPaginatedResponse(withImages, total, query.page, query.limit),
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
    return rating ? this.withOwnImages(rating, userId) : null;
  }

  async create(
    activityId: number,
    userId: number,
    dto: CreateRatingDto,
  ): Promise<OwnRatingDto> {
    await this.requireActivity(activityId);
    await this.requireEligiblePlan(dto.planId, activityId, userId);
    try {
      const saved = await this.ratings.save(
        this.ratings.create({
          idActivity: activityId,
          idUser: userId,
          idPlan: dto.planId,
          score: dto.score,
          comment: dto.comment ?? null,
          status: ContentStatus.Published,
          idFeedback: null,
        }),
      );
      const rating = await this.ratings.findOneOrFail({
        where: { id: saved.id },
        relations: { user: true },
      });
      return this.withOwnImages(rating, userId);
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
    if (dto.comment !== undefined && dto.comment !== rating.comment) {
      rating.comment = dto.comment;
      rating.status = statusAfterEdit(rating.status);
    }
    return this.withOwnImages(await this.ratings.save(rating), userId);
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

  private async withOwnImages(
    rating: Rating,
    userId: number,
  ): Promise<OwnRatingDto> {
    return {
      ...this.toOwn(rating),
      images: await this.media.list('rating', rating.id, userId),
    };
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
      .andWhere(publicContentSql('rating.status'))
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
      ((query.sortBy as RatingSortField | undefined) ??
        RatingSortField.CREATED_AT) === RatingSortField.SCORE
        ? 'rating.score'
        : 'rating.createdAt';
    builder.orderBy(column, direction).addOrderBy('rating.id', 'ASC');
  }

  private toPublic(rating: Rating, viewerId?: number): PublicRatingDto {
    return {
      id: rating.id,
      score: rating.score,
      comment: rating.comment,
      authorAlias: authorAlias(rating.user.name, rating.user.lastName),
      createdAt: rating.createdAt,
      updatedAt: rating.updatedAt,
      isOwn: viewerId !== undefined && rating.idUser === viewerId,
    };
  }

  private toOwn(rating: Rating): OwnRatingDto {
    return {
      ...this.toPublic(rating, rating.idUser),
      activityId: rating.idActivity,
      planId: rating.idPlan,
      removed: rating.status === ContentStatus.Removed,
    };
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
