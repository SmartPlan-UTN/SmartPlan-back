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
import {
  ExperienceDto,
  ExperiencesPageDto,
} from './dto/experience-response.dto';
import { Plan, PlanKind, PlanVisibility } from './entities/plan.entity';
import { canViewerReadPlan, hasCommunity } from './plan-selectability';
import { PlansService } from './plans.service';
import { CommunityQueryDto } from './dto/community-query.dto';
import { User } from '../users/entities/user.entity';
import { ContentStatus } from '../common/moderation/content-status';

/** How many of the latest photos the summary gallery carries. */
const SUMMARY_PHOTO_LIMIT = 12;

/**
 * Community experiences (#106): feedback deliberately shared from completed
 * outings, with the outings' photos. A source plan remains optional. Everything shared is
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
    viewerUserId: number | null,
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
      .innerJoin('author.status', 'authorStatus')
      .innerJoin('outing.status', 'outingStatus')
      .where('outing.idSourcePlan = :planId', { planId })
      .andWhere('outing.kind = :kind', { kind: PlanKind.Outing })
      .andWhere('outing.deletedAt IS NULL')
      .andWhere('outingStatus.key = :completed', { completed: 'completed' })
      .andWhere('author.deletedAt IS NULL')
      // Same authors as the experience list: media refuses the others' photos.
      .andWhere('authorStatus.key = :activeAuthor', { activeAuthor: 'active' })
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

    const data: ExperienceDto[] = feedbacks.map((feedback) => {
      const inspiration = this.publicInspiration(feedback.plan.sourcePlan);
      return {
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
          alias: 'Viajero/a',
          username: feedback.plan.user.username ?? undefined,
          avatarUrl: avatars.get(feedback.plan.idUser) ?? null,
        },
        inspiredBy: inspiration
          ? {
              id: inspiration.id,
              title: inspiration.title,
              creatorUsername: inspiration.user?.username ?? null,
            }
          : null,
        photos: (pagePhotos.get(feedback.idPlan) ?? []).map((image) =>
          this.media.toDto(image),
        ),
      };
    });

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
  async listCommunity(
    query: CommunityQueryDto,
    viewerUserId: number | null,
    username?: string,
  ) {
    const builder = this.sharedFeedback();
    if (username)
      builder.andWhere('LOWER(author.username) = LOWER(:username)', {
        username,
      });
    if (query.q) {
      builder.andWhere(
        `((feedback.comment_status IN (:...publicCommentStatuses) AND feedback.comment ILIKE :term) OR
          feedback.tags::text ILIKE :term OR author.username ILIKE :term OR
          (
          sourcePlan.visibility = :publicVisibility AND
          sourcePlan.communityStatus = :publishedStatus AND
          sourceStatus.key != :cancelledStatus AND
          sourceAuthorStatus.key = :activeSourceAuthor AND
          (sourcePlan.title ILIKE :term OR sourcePlan.description ILIKE :term OR
           outingDetail.action ILIKE :term OR outingPlace.name ILIKE :term OR outingPlace.address ILIKE :term OR outingCity.name ILIKE :term OR
           outingActivity.name ILIKE :term OR outingActivity.description ILIKE :term OR
           activityPlace.name ILIKE :term OR activityPlace.address ILIKE :term OR activityCity.name ILIKE :term)
        ))`,
        {
          term: this.searchTerm(query.q),
          publicCommentStatuses: [ContentStatus.Published, ContentStatus.Kept],
          publicVisibility: PlanVisibility.Public,
          publishedStatus: ContentStatus.Published,
          cancelledStatus: 'cancelled',
          activeSourceAuthor: 'active',
        },
      );
      builder
        .leftJoin('sourcePlan.details', 'outingDetail')
        .leftJoin('outingDetail.place', 'outingPlace')
        .leftJoin('outingPlace.department', 'outingDepartment')
        .leftJoin('outingDepartment.city', 'outingCity')
        .leftJoin('outingDetail.activity', 'outingActivity')
        .leftJoin('outingActivity.places', 'activityPlaceLink')
        .leftJoin('activityPlaceLink.place', 'activityPlace')
        .leftJoin('activityPlace.department', 'activityDepartment')
        .leftJoin('activityDepartment.city', 'activityCity');
    }
    const [feedbacks, total] = await builder
      .orderBy('outing.completedAt', 'DESC')
      .addOrderBy('feedback.id', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    const photos = await this.visiblePhotos(
      feedbacks.map((feedback) => feedback.idPlan),
      viewerUserId,
    );
    const avatars = await this.avatarUrls(
      feedbacks.map((feedback) => feedback.plan.idUser),
    );
    const data = feedbacks.map((feedback) =>
      this.toExperience(feedback, photos, avatars, viewerUserId),
    );
    return createPaginatedResponse(data, total, query.page, query.limit);
  }

  async getCreator(username: string) {
    const user = await this.dataSource
      .getRepository(User)
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.status', 'status')
      .where('LOWER(user.username) = LOWER(:username)', {
        username,
      })
      .andWhere('user.deletedAt IS NULL')
      .andWhere('status.key = :active', { active: 'active' })
      .getOne();
    const notFound = () =>
      new NotFoundException({
        code: 'CREATOR_NOT_FOUND',
        message: 'No encontramos este perfil',
      });
    if (!user) throw notFound();
    const plans = await this.dataSource
      .getRepository(Plan)
      .createQueryBuilder('plan')
      .innerJoin('plan.status', 'status')
      .where('plan.idUser = :userId', { userId: user.id })
      .andWhere('plan.kind = :kind', { kind: PlanKind.Authored })
      .andWhere('plan.visibility = :visibility', {
        visibility: PlanVisibility.Public,
      })
      .andWhere('plan.communityStatus = :published', {
        published: ContentStatus.Published,
      })
      .andWhere('status.key != :cancelled', { cancelled: 'cancelled' })
      .getCount();
    const experiences = await this.sharedFeedback()
      .andWhere('outing.idUser = :userId', { userId: user.id })
      .getCount();
    // Generated usernames are sequential: only people who published something
    // have a public profile, so accounts cannot be listed through it.
    if (plans === 0 && experiences === 0) throw notFound();
    const avatar = await this.dataSource.getRepository(UserAvatar).findOne({
      where: { idUser: user.id, isCurrent: true },
    });
    return {
      username: user.username,
      bio: user.bio,
      avatarUrl: avatar ? `/api/media/avatar/${avatar.id}` : null,
      planCount: plans,
      experienceCount: experiences,
    };
  }

  async listCreatorPlans(username: string, query: CommunityQueryDto) {
    const user = await this.dataSource
      .getRepository(User)
      .createQueryBuilder('user')
      .innerJoin('user.status', 'userStatus')
      .where('LOWER(user.username) = LOWER(:username)', {
        username,
      })
      .andWhere('user.deletedAt IS NULL')
      .andWhere('userStatus.key = :active', { active: 'active' })
      .getOne();
    if (!user)
      throw new NotFoundException({
        code: 'CREATOR_NOT_FOUND',
        message: 'No encontramos este perfil',
      });
    const builder = this.dataSource
      .getRepository(Plan)
      .createQueryBuilder('plan')
      .innerJoinAndSelect('plan.status', 'status')
      .where('plan.idUser = :userId', { userId: user.id })
      .andWhere('plan.kind = :kind', { kind: PlanKind.Authored })
      .andWhere('plan.visibility = :visibility', {
        visibility: PlanVisibility.Public,
      })
      .andWhere('plan.communityStatus = :published', {
        published: ContentStatus.Published,
      })
      .andWhere('status.key != :cancelled', { cancelled: 'cancelled' });
    if (query.q) {
      builder.andWhere(
        `(plan.title ILIKE :term OR plan.description ILIKE :term OR
          communityDetail.action ILIKE :term OR communityPlace.name ILIKE :term OR communityPlace.address ILIKE :term OR communityCity.name ILIKE :term OR
          communityActivity.name ILIKE :term OR communityActivity.description ILIKE :term OR
          communityActivityPlace.name ILIKE :term OR communityActivityPlace.address ILIKE :term OR communityActivityCity.name ILIKE :term)`,
        { term: this.searchTerm(query.q) },
      );
      builder
        .leftJoin('plan.details', 'communityDetail')
        .leftJoin('communityDetail.place', 'communityPlace')
        .leftJoin('communityPlace.department', 'communityDepartment')
        .leftJoin('communityDepartment.city', 'communityCity')
        .leftJoin('communityDetail.activity', 'communityActivity')
        .leftJoin('communityActivity.places', 'communityActivityPlaceLink')
        .leftJoin('communityActivityPlaceLink.place', 'communityActivityPlace')
        .leftJoin(
          'communityActivityPlace.department',
          'communityActivityDepartment',
        )
        .leftJoin('communityActivityDepartment.city', 'communityActivityCity');
    }
    const [plans, total] = await builder
      .orderBy('plan.updatedAt', 'DESC')
      .addOrderBy('plan.id', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    const data = await Promise.all(
      plans.map(async (plan) => {
        const images = await this.media.list('plan', plan.id);
        return {
          id: plan.id,
          title: plan.title,
          description: plan.description,
          estimatedTotalCost: plan.estimatedTotalCost,
          estimatedTotalCostMax: plan.estimatedTotalCostMax,
          priceCompleteness: plan.priceCompleteness,
          estimatedTotalDuration: plan.estimatedTotalDuration,
          imageUrl:
            images.find((image) => image.isPrimary)?.url ??
            images[0]?.url ??
            null,
        };
      }),
    );
    return createPaginatedResponse(data, total, query.page, query.limit);
  }

  async listCommunityPlans(query: CommunityQueryDto) {
    const builder = this.dataSource
      .getRepository(Plan)
      .createQueryBuilder('plan')
      .innerJoin('plan.status', 'status')
      .innerJoinAndSelect('plan.user', 'author')
      .innerJoin('author.status', 'authorStatus')
      .where('plan.kind = :kind', { kind: PlanKind.Authored })
      .andWhere('plan.visibility = :visibility', {
        visibility: PlanVisibility.Public,
      })
      .andWhere('plan.communityStatus = :published', {
        published: ContentStatus.Published,
      })
      .andWhere('status.key != :cancelled', { cancelled: 'cancelled' })
      .andWhere('author.deletedAt IS NULL')
      .andWhere('authorStatus.key = :active', { active: 'active' });
    if (query.q) {
      builder
        .andWhere(
          `(plan.title ILIKE :term OR plan.description ILIKE :term OR
            communityDetail.action ILIKE :term OR communityPlace.name ILIKE :term OR communityPlace.address ILIKE :term OR communityCity.name ILIKE :term OR
            communityActivity.name ILIKE :term OR communityActivity.description ILIKE :term OR
            communityActivityPlace.name ILIKE :term OR communityActivityPlace.address ILIKE :term OR communityActivityCity.name ILIKE :term)`,
          { term: this.searchTerm(query.q) },
        )
        .leftJoin('plan.details', 'communityDetail')
        .leftJoin('communityDetail.place', 'communityPlace')
        .leftJoin('communityPlace.department', 'communityDepartment')
        .leftJoin('communityDepartment.city', 'communityCity')
        .leftJoin('communityDetail.activity', 'communityActivity')
        .leftJoin('communityActivity.places', 'communityActivityPlaceLink')
        .leftJoin('communityActivityPlaceLink.place', 'communityActivityPlace')
        .leftJoin(
          'communityActivityPlace.department',
          'communityActivityDepartment',
        )
        .leftJoin('communityActivityDepartment.city', 'communityActivityCity');
    }
    const [plans, total] = await builder
      .orderBy('plan.updatedAt', 'DESC')
      .addOrderBy('plan.id', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    const data = await Promise.all(
      plans.map(async (plan) => {
        const images = await this.media.list('plan', plan.id);
        return {
          id: plan.id,
          title: plan.title,
          description: plan.description,
          estimatedTotalCost: plan.estimatedTotalCost,
          estimatedTotalCostMax: plan.estimatedTotalCostMax,
          priceCompleteness: plan.priceCompleteness,
          estimatedTotalDuration: plan.estimatedTotalDuration,
          imageUrl:
            images.find((image) => image.isPrimary)?.url ??
            images[0]?.url ??
            null,
          authorUsername: plan.user?.username ?? null,
        };
      }),
    );
    return createPaginatedResponse(data, total, query.page, query.limit);
  }

  async findCommunityExperience(id: number, viewerUserId: number | null) {
    const feedback = await this.sharedFeedback()
      .andWhere('feedback.id = :id', { id })
      .getOne();
    if (!feedback)
      throw new NotFoundException({
        code: 'EXPERIENCE_NOT_FOUND',
        message: 'La experiencia no existe',
      });
    const photos = await this.visiblePhotos([feedback.idPlan], viewerUserId);
    const avatars = await this.avatarUrls([feedback.plan.idUser]);
    return this.toExperience(feedback, photos, avatars, viewerUserId);
  }

  private searchTerm(query: string): string {
    return `%${query.replace(/[\\%_]/g, '\\$&')}%`;
  }

  private sharedFeedback(planId?: number): SelectQueryBuilder<Feedback> {
    const builder = this.dataSource
      .getRepository(Feedback)
      .createQueryBuilder('feedback')
      .innerJoinAndSelect('feedback.plan', 'outing')
      .innerJoinAndSelect('outing.user', 'author')
      .innerJoin('author.status', 'authorStatus')
      .leftJoinAndSelect('outing.sourcePlan', 'sourcePlan')
      .leftJoinAndSelect('sourcePlan.status', 'sourceStatus')
      .leftJoinAndSelect('sourcePlan.user', 'sourceAuthor')
      .leftJoinAndSelect('sourceAuthor.status', 'sourceAuthorStatus')
      .leftJoinAndSelect('sourcePlan.inspiredByPlan', 'inspirationPlan')
      .leftJoinAndSelect('inspirationPlan.status', 'inspirationStatus')
      .leftJoinAndSelect('inspirationPlan.user', 'inspirationAuthor')
      .leftJoinAndSelect('inspirationAuthor.status', 'inspirationAuthorStatus')
      .innerJoin('outing.status', 'outingStatus')
      .where('outingStatus.key = :completed', { completed: 'completed' })
      .andWhere('outing.kind = :kind', { kind: PlanKind.Outing })
      .andWhere('outing.deletedAt IS NULL')
      .andWhere('author.deletedAt IS NULL')
      .andWhere('authorStatus.key = :activeAuthor', { activeAuthor: 'active' })
      .andWhere('feedback.isShared = true')
      .andWhere('feedback.deletedAt IS NULL');
    if (planId !== undefined)
      builder.andWhere('outing.idSourcePlan = :planId', { planId });
    else
      builder.andWhere('feedback.communityConsentVersion = :consentVersion', {
        consentVersion: 1,
      });
    return builder;
  }

  private toExperience(
    feedback: Feedback,
    photos: Map<number, PlanImage[]>,
    avatars: Map<number, string>,
    viewerUserId: number | null,
  ): ExperienceDto {
    const source = feedback.plan.sourcePlan;
    const inspiration = this.publicInspiration(source);
    return {
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
        alias: 'Viajero/a',
        username: feedback.plan.user.username ?? undefined,
        avatarUrl: avatars.get(feedback.plan.idUser) ?? null,
      },
      inspiredBy: inspiration
        ? {
            id: inspiration.id,
            title: inspiration.title,
            creatorUsername: inspiration.user?.username ?? null,
          }
        : null,
      photos: (photos.get(feedback.idPlan) ?? []).map((image) =>
        this.media.toDto(image),
      ),
    };
  }

  private isPublicInspiration(plan: Plan | null | undefined): plan is Plan {
    return Boolean(
      plan &&
      plan.kind === PlanKind.Authored &&
      plan.visibility === PlanVisibility.Public &&
      plan.communityStatus === ContentStatus.Published &&
      plan.status?.key !== 'cancelled' &&
      plan.user?.status?.key === 'active',
    );
  }

  private publicInspiration(source: Plan | null | undefined): Plan | null {
    if (!this.isPublicInspiration(source)) return null;
    const original = source.inspiredByPlan;
    return this.isPublicInspiration(original) ? original : source;
  }

  /**
   * The photos the outing's owner took, without those copied from the plan,
   * that the viewer may see.
   */
  private async visiblePhotos(
    outingIds: number[],
    viewerUserId: number | null,
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
