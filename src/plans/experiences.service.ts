import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, In, SelectQueryBuilder } from 'typeorm';
import {
  canViewContent,
  viewableContentSql,
} from '../common/moderation/content-status';
import { PaginatedQueryDto } from '../common/pagination/paginated-query.dto';
import { createPaginatedResponse } from '../common/pagination/paginated-response';
import { PlanImage, UserAvatar } from '../media/entities/media-images.entity';
import { MediaService } from '../media/media.service';
import { Feedback } from '../recommendation/entities/feedback.entity';
import { authorAlias } from '../users/author-alias';
import {
  ExperienceDto,
  ExperiencesPageDto,
} from './dto/experience-response.dto';
import { Plan, PlanKind } from './entities/plan.entity';
import { canViewerReadPlan, hasCommunity } from './plan-selectability';
import { PlansService } from './plans.service';

/** How many of the latest photos the summary gallery carries. */
const SUMMARY_PHOTO_LIMIT = 12;

/**
 * Community experiences (#106): the shared feedback of every outing done
 * from a published plan, with the outings' photos. Everything shared is
 * public at once; a reported comment or photo is hidden from everyone but
 * its author until an administrator decides (SmartPlan-front#156).
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
      .innerJoinAndSelect('image.plan', 'outing')
      .innerJoin(Feedback, 'feedback', 'feedback.idPlan = outing.id')
      .innerJoin('outing.user', 'author')
      .where('outing.idSourcePlan = :planId', { planId })
      .andWhere('outing.kind = :kind', { kind: PlanKind.Outing })
      .andWhere('outing.deletedAt IS NULL')
      .andWhere('author.deletedAt IS NULL')
      .andWhere('feedback.isShared = true')
      .andWhere('feedback.deletedAt IS NULL')
      .andWhere(viewableContentSql('image.communityStatus', 'outing.idUser'), {
        viewerId: viewerUserId,
      })
      .andWhere('image.isSourceCopy = false');
    const [latestPhotos, photoCount] = await photosQuery
      .orderBy('image.createdAt', 'DESC')
      .addOrderBy('image.id', 'DESC')
      .take(SUMMARY_PHOTO_LIMIT)
      .getManyAndCount();

    const outingIds = feedbacks.map((feedback) => feedback.idPlan);
    const pagePhotos = await this.visiblePhotos(outingIds, viewerUserId);
    const avatars = await this.avatarUrls(
      feedbacks.map((feedback) => feedback.plan.idUser),
    );

    const data: ExperienceDto[] = feedbacks.map((feedback) => ({
      id: feedback.id,
      rating: feedback.rating,
      tags: feedback.tags ?? [],
      comment:
        feedback.commentStatus === null ||
        canViewContent(feedback.commentStatus, {
          isAuthor: feedback.plan.idUser === viewerUserId,
        })
          ? feedback.comment
          : null,
      isOwn: feedback.plan.idUser === viewerUserId,
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
        photos: latestPhotos.map((image) => ({
          ...this.media.toDto(image),
          isOwn: image.plan.idUser === viewerUserId,
        })),
      },
    };
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

  /**
   * The photos the outing's owner took, without those copied from the plan,
   * that the viewer may see.
   */
  private async visiblePhotos(
    outingIds: number[],
    viewerUserId: number,
  ): Promise<Map<number, PlanImage[]>> {
    if (outingIds.length === 0) return new Map();
    return this.groupByOuting(
      await this.dataSource
        .getRepository(PlanImage)
        .createQueryBuilder('image')
        .innerJoin('image.plan', 'outing')
        .where('image.idPlan IN (:...outingIds)', { outingIds })
        .andWhere('image.isSourceCopy = false')
        .andWhere(
          viewableContentSql('image.communityStatus', 'outing.idUser'),
          { viewerId: viewerUserId },
        )
        .orderBy('image.displayOrder', 'ASC')
        .addOrderBy('image.id', 'ASC')
        .getMany(),
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
}
