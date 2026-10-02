import { Injectable, NotFoundException } from '@nestjs/common';
import { Brackets, DataSource, In, Not, SelectQueryBuilder } from 'typeorm';
import { CommunityContentStatus } from '../common/moderation/community-content-status';
import { PaginatedQueryDto } from '../common/pagination/paginated-query.dto';
import {
  createPaginatedResponse,
  PaginatedResponse,
} from '../common/pagination/paginated-response';
import { PlanImage, UserAvatar } from '../media/entities/media-images.entity';
import { MediaService } from '../media/media.service';
import { Feedback } from '../recommendation/entities/feedback.entity';
import { authorAlias } from '../users/author-alias';
import {
  AdminExperienceDto,
  ExperienceDto,
  ExperiencesPageDto,
} from './dto/experience-response.dto';
import { ListAdminExperiencesQueryDto } from './dto/list-admin-experiences-query.dto';
import { ModerateExperienceContentDto } from './dto/moderate-experience-content.dto';
import { Plan, PlanKind } from './entities/plan.entity';
import { notifyExperienceRejection } from './experience-notifications';
import { canViewerReadPlan, hasCommunity } from './plan-selectability';
import { PlansService } from './plans.service';

/** How many of the latest photos the summary gallery carries. */
const SUMMARY_PHOTO_LIMIT = 12;

/**
 * Community experiences (#106): the shared feedback of every outing done
 * from a published plan, with the outings' photos. Moderation happens after
 * publication, so everything shared is public until an administrator takes
 * a comment or a photo down.
 */
@Injectable()
export class ExperiencesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly plans: PlansService,
    private readonly media: MediaService,
  ) {}

  async listForPlan(
    planId: number,
    viewerUserId: number,
    query: PaginatedQueryDto,
  ): Promise<ExperiencesPageDto> {
    const plan = await this.dataSource.getRepository(Plan).findOne({
      where: { id: planId },
      relations: { status: true },
    });
    // Same answer as the plan detail: an unreadable plan reveals nothing,
    // and an outing is someone's copy, never the plan people review.
    if (
      !plan ||
      plan.kind === PlanKind.Outing ||
      !canViewerReadPlan(this.plans.accessFacts(plan), viewerUserId)
    ) {
      throw new NotFoundException({
        code: 'PLAN_NOT_FOUND',
        message: 'El plan solicitado no existe',
      });
    }
    // Its owner may still read a plan made private, but only a published
    // plan has a community, the same rule that opens its outings' photos.
    if (!hasCommunity(this.plans.accessFacts(plan))) {
      return {
        ...createPaginatedResponse([], 0, query.page, query.limit),
        summary: {
          averageRating: 0,
          experienceCount: 0,
          photoCount: 0,
          photos: [],
        },
      };
    }

    const totals = await this.sharedFeedback(planId)
      .select('AVG(feedback.rating)', 'average')
      .addSelect('COUNT(feedback.id)', 'count')
      .getRawOne<{ average: string | null; count: string }>();

    const [feedbacks, total] = await this.sharedFeedback(planId)
      .orderBy('outing.completedAt', 'DESC', 'NULLS LAST')
      .addOrderBy('feedback.id', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    const photosQuery = this.dataSource
      .getRepository(PlanImage)
      .createQueryBuilder('image')
      .innerJoin(Plan, 'outing', 'outing.id = image.idPlan')
      .innerJoin(Feedback, 'feedback', 'feedback.idPlan = outing.id')
      .innerJoin('outing.user', 'author')
      .where('outing.idSourcePlan = :planId', { planId })
      .andWhere('outing.kind = :kind', { kind: PlanKind.Outing })
      .andWhere('outing.deletedAt IS NULL')
      .andWhere('author.deletedAt IS NULL')
      .andWhere('feedback.isShared = true')
      .andWhere('feedback.deletedAt IS NULL')
      .andWhere('image.communityStatus != :rejected', {
        rejected: CommunityContentStatus.Rejected,
      })
      .andWhere('image.isSourceCopy = false');
    const [latestPhotos, photoCount] = await photosQuery
      .orderBy('image.createdAt', 'DESC')
      .addOrderBy('image.id', 'DESC')
      .take(SUMMARY_PHOTO_LIMIT)
      .getManyAndCount();

    const outingIds = feedbacks.map((feedback) => feedback.idPlan);
    const pagePhotos = await this.visiblePhotos(outingIds);
    const avatars = await this.avatarUrls(
      feedbacks.map((feedback) => feedback.plan.idUser),
    );

    const data: ExperienceDto[] = feedbacks.map((feedback) => ({
      id: feedback.id,
      rating: feedback.rating,
      tags: feedback.tags ?? [],
      comment:
        feedback.commentStatus === CommunityContentStatus.Rejected
          ? null
          : feedback.comment,
      completedAt: feedback.plan.completedAt,
      author: {
        alias: authorAlias(
          feedback.plan.user.name,
          feedback.plan.user.lastName,
        ),
        avatarUrl: avatars.get(feedback.plan.idUser) ?? null,
      },
      photos: (pagePhotos.get(feedback.idPlan) ?? []).map((image) =>
        this.media.toDto(image),
      ),
    }));

    const count = Number(totals?.count ?? 0);
    return {
      ...createPaginatedResponse(data, total, query.page, query.limit),
      summary: {
        averageRating:
          count === 0 ? 0 : Math.round(Number(totals?.average) * 10) / 10,
        experienceCount: count,
        photoCount,
        photos: latestPhotos.map((image) => this.media.toDto(image)),
      },
    };
  }

  async listAdmin(
    query: ListAdminExperiencesQueryDto,
  ): Promise<PaginatedResponse<AdminExperienceDto>> {
    const builder = this.dataSource
      .getRepository(Feedback)
      .createQueryBuilder('feedback')
      .innerJoinAndSelect('feedback.plan', 'outing')
      .innerJoinAndSelect('outing.user', 'author')
      .leftJoinAndSelect('outing.sourcePlan', 'sourcePlan')
      .where('outing.kind = :kind', { kind: PlanKind.Outing })
      // Content stays in the queue once shared, even if made private later:
      // an administrator may still need to take it down.
      .andWhere('feedback.sharedAt IS NOT NULL');
    if (query.status) {
      builder.andWhere(
        new Brackets((where) =>
          where
            .where('feedback.commentStatus = :status')
            .orWhere(
              `EXISTS (SELECT 1 FROM "plan_image" "photo" WHERE "photo"."id_plan" = "outing"."id" AND "photo"."deleted_at" IS NULL AND "photo"."is_source_copy" = false AND "photo"."community_status" = :status)`,
            ),
        ),
        { status: query.status },
      );
    }
    const [feedbacks, total] = await builder
      .orderBy('feedback.sharedAt', 'DESC')
      .addOrderBy('feedback.id', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    const photos = await this.allPhotos(feedbacks.map((item) => item.idPlan));
    return createPaginatedResponse(
      feedbacks.map((feedback) =>
        this.toAdmin(feedback, photos.get(feedback.idPlan) ?? []),
      ),
      total,
      query.page,
      query.limit,
    );
  }

  async moderateComment(
    feedbackId: number,
    dto: ModerateExperienceContentDto,
  ): Promise<AdminExperienceDto> {
    const feedback = await this.findModeratable(feedbackId);
    if (feedback.commentStatus === null) {
      throw new NotFoundException({
        code: 'EXPERIENCE_COMMENT_NOT_FOUND',
        message: 'This experience has no shared comment to moderate',
      });
    }
    const newlyRejected =
      dto.status === CommunityContentStatus.Rejected &&
      feedback.commentStatus !== CommunityContentStatus.Rejected;
    await this.dataSource.transaction(async (manager) => {
      feedback.commentStatus = dto.status;
      feedback.commentModerationReason =
        dto.status === CommunityContentStatus.Rejected ? dto.reason! : null;
      await manager.save(feedback);
      if (newlyRejected)
        await notifyExperienceRejection(
          manager,
          feedback.plan,
          'comment',
          dto.reason!,
        );
    });
    return this.toAdmin(
      feedback,
      (await this.allPhotos([feedback.idPlan])).get(feedback.idPlan) ?? [],
    );
  }

  async moderatePhoto(
    feedbackId: number,
    imageId: number,
    dto: ModerateExperienceContentDto,
  ): Promise<AdminExperienceDto> {
    const feedback = await this.findModeratable(feedbackId);
    const image = await this.dataSource.getRepository(PlanImage).findOneBy({
      id: imageId,
      idPlan: feedback.idPlan,
      isSourceCopy: false,
    });
    if (!image) {
      throw new NotFoundException({
        code: 'EXPERIENCE_PHOTO_NOT_FOUND',
        message: 'The photo does not belong to this experience',
      });
    }
    const newlyRejected =
      dto.status === CommunityContentStatus.Rejected &&
      image.communityStatus !== CommunityContentStatus.Rejected;
    await this.dataSource.transaction(async (manager) => {
      image.communityStatus = dto.status;
      image.communityReason =
        dto.status === CommunityContentStatus.Rejected ? dto.reason! : null;
      await manager.save(image);
      if (newlyRejected)
        await notifyExperienceRejection(
          manager,
          feedback.plan,
          'photo',
          dto.reason!,
        );
    });
    return this.toAdmin(
      feedback,
      (await this.allPhotos([feedback.idPlan])).get(feedback.idPlan) ?? [],
    );
  }

  /**
   * Shared feedback of the outings done from `planId`. A deleted account
   * takes its experiences with it, so the totals, the cards and the photos
   * all leave its outings out.
   */
  private sharedFeedback(planId: number): SelectQueryBuilder<Feedback> {
    return this.dataSource
      .getRepository(Feedback)
      .createQueryBuilder('feedback')
      .innerJoinAndSelect('feedback.plan', 'outing')
      .innerJoinAndSelect('outing.user', 'author')
      .where('outing.idSourcePlan = :planId', { planId })
      .andWhere('outing.kind = :kind', { kind: PlanKind.Outing })
      .andWhere('outing.deletedAt IS NULL')
      .andWhere('author.deletedAt IS NULL')
      .andWhere('feedback.isShared = true');
  }

  private async findModeratable(id: number): Promise<Feedback> {
    const feedback = await this.dataSource.getRepository(Feedback).findOne({
      where: { id },
      relations: { plan: { user: true, sourcePlan: true } },
    });
    // A deleted account's experiences are no longer public, and its soft
    // deleted user does not load: nothing is left to moderate.
    if (!feedback || feedback.sharedAt === null || !feedback.plan.user) {
      throw new NotFoundException({
        code: 'EXPERIENCE_NOT_FOUND',
        message: 'The requested experience does not exist',
      });
    }
    return feedback;
  }

  /** The photos the outing's owner took, without those copied from the plan. */
  private async visiblePhotos(
    outingIds: number[],
  ): Promise<Map<number, PlanImage[]>> {
    if (outingIds.length === 0) return new Map();
    return this.groupByOuting(
      await this.dataSource.getRepository(PlanImage).find({
        where: {
          idPlan: In(outingIds),
          isSourceCopy: false,
          communityStatus: Not(CommunityContentStatus.Rejected),
        },
        order: { displayOrder: 'ASC', id: 'ASC' },
      }),
    );
  }

  /** Every photo the outing's owner took, whatever its moderation. */
  private async allPhotos(
    outingIds: number[],
  ): Promise<Map<number, PlanImage[]>> {
    if (outingIds.length === 0) return new Map();
    return this.groupByOuting(
      await this.dataSource.getRepository(PlanImage).find({
        where: { idPlan: In(outingIds), isSourceCopy: false },
        order: { displayOrder: 'ASC', id: 'ASC' },
      }),
    );
  }

  private groupByOuting(images: PlanImage[]): Map<number, PlanImage[]> {
    const grouped = new Map<number, PlanImage[]>();
    for (const image of images) {
      grouped.set(image.idPlan, [...(grouped.get(image.idPlan) ?? []), image]);
    }
    return grouped;
  }

  private async avatarUrls(userIds: number[]): Promise<Map<number, string>> {
    if (userIds.length === 0) return new Map();
    const avatars = await this.dataSource.getRepository(UserAvatar).find({
      where: { idUser: In([...new Set(userIds)]), isCurrent: true },
    });
    return new Map(
      avatars.map((avatar) => [
        avatar.idUser,
        `/api/media/avatar/${avatar.id}`,
      ]),
    );
  }

  private toAdmin(feedback: Feedback, photos: PlanImage[]): AdminExperienceDto {
    const outing = feedback.plan;
    return {
      id: feedback.id,
      rating: feedback.rating,
      tags: feedback.tags ?? [],
      comment: feedback.comment,
      commentStatus: feedback.commentStatus,
      commentModerationReason: feedback.commentModerationReason,
      shared: feedback.isShared,
      sharedAt: feedback.sharedAt,
      completedAt: outing.completedAt,
      outingId: outing.id,
      plan: outing.sourcePlan
        ? { id: outing.sourcePlan.id, title: outing.sourcePlan.title }
        : null,
      author: {
        id: outing.user.id,
        name: outing.user.name,
        lastName: outing.user.lastName,
      },
      photos: photos.map((image) => ({
        ...this.media.toDto(image),
        communityStatus: image.communityStatus,
        communityReason: image.communityReason,
      })),
    };
  }
}
