import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In, SelectQueryBuilder } from 'typeorm';
import {
  canViewContent,
  viewableContentSql,
} from '../common/moderation/content-status';
import { PaginatedQueryDto } from '../common/pagination/paginated-query.dto';
import { createPaginatedResponse } from '../common/pagination/paginated-response';
import { PlanImage, UserAvatar } from '../media/entities/media-images.entity';
import { imageSourceOf } from '../media/image-source';
import { MediaService } from '../media/media.service';
import { Feedback } from '../recommendation/entities/feedback.entity';
import {
  CommunityCreatorSummaryDto,
  CommunityFeedItemDto,
  CommunityPlanCardDto,
  ExperienceDto,
  ExperiencesPageDto,
} from './dto/experience-response.dto';
import { PlanDetail } from './entities/plan-detail.entity';
import { Plan, PlanKind, PlanVisibility } from './entities/plan.entity';
import { canViewerReadPlan, hasCommunity } from './plan-selectability';
import { PLAN_IMAGE_URL_SQL } from './plan-summary.sql';
import { PlansService } from './plans.service';
import {
  CommunityFeedQueryDto,
  CommunityQueryDto,
} from './dto/community-query.dto';
import { User } from '../users/entities/user.entity';
import { ContentStatus } from '../common/moderation/content-status';
import { CommunityExperienceLike } from './entities/community-experience-like.entity';
import { CommunityExperienceVisit } from './entities/community-experience-visit.entity';

const MAX_COMMUNITY_EXPERIENCE_VISITS = 100;

/**
 * A search term for `ILIKE`: the person's own `%` and `_` are text, not
 * wildcards, so a search cannot be turned into a scan of everything.
 */
export function likeTerm(q: string): string {
  const plainText = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return `%${plainText.replace(/[\\%_]/g, '\\$&')}%`;
}

/** PostgreSQL-side accent folding for common Spanish search fields. */
function searchableTextSql(fields: string[]): string {
  const joined = `concat_ws(' ', ${fields.join(', ')})`;
  return `translate(lower(${joined}), 'áéíóúüñ', 'aeiouun')`;
}

/** How many of the latest photos the summary gallery carries. */
const SUMMARY_PHOTO_LIMIT = 12;

/**
 * Community experiences (#106): feedback deliberately shared from completed
 * outings, with the outings' photos. Global Community discovery requires the
 * current explicit consent version; legacy sharing stays plan-scoped.
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
      .andWhere('outingStatus.key = :completed', { completed: 'completed' })
      .andWhere('authorStatus.key = :activeAuthor', { activeAuthor: 'active' })
      .andWhere('outing.completedAt IS NOT NULL')
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
    const data = await this.experienceCards(
      feedbacks,
      viewerUserId,
      pagePhotos,
    );

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
    if (query.q) this.searchExperiences(builder, query.q);
    const [feedbacks, total] = await builder
      .orderBy('outing.completedAt', 'DESC')
      .addOrderBy('feedback.id', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    const data = await this.experienceCards(feedbacks, viewerUserId);
    return createPaginatedResponse(data, total, query.page, query.limit);
  }

  private searchExperiences(builder: SelectQueryBuilder<Feedback>, q: string) {
    builder.andWhere(
      `((feedback.comment_status IN (:...publicCommentStatuses) AND
          ${searchableTextSql(['feedback.comment'])} ILIKE :term) OR
          ${searchableTextSql(['feedback.tags::text', 'author.username'])} ILIKE :term OR
          (
          sourcePlan.visibility = :publicVisibility AND
          sourcePlan.communityStatus = :publishedStatus AND
          sourceStatus.key != :cancelledStatus AND
          sourceAuthorStatus.key = :activeSourceAuthor AND
          ${searchableTextSql([
            'sourcePlan.title',
            'outingPlace.name',
            'outingPlace.address',
            'outingCity.name',
            'outingActivity.name',
            'outingActivity.description',
            'activityPlace.name',
            'activityPlace.address',
            'activityCity.name',
          ])} ILIKE :term
        ))`,
      {
        term: likeTerm(q),
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

  private async experienceCards(
    feedbacks: Feedback[],
    viewerUserId: number | null,
    existingPhotos?: Map<number, PlanImage[]>,
  ) {
    const [photos, avatars, likes, visitCounts] = await Promise.all([
      existingPhotos ??
        this.visiblePhotos(
          feedbacks.map((feedback) => feedback.idPlan),
          viewerUserId,
        ),
      this.avatarUrls(feedbacks.map((feedback) => feedback.plan.idUser)),
      this.experienceLikeStats(
        feedbacks.map((feedback) => feedback.id),
        viewerUserId,
      ),
      this.experienceVisitCounts(feedbacks.map((feedback) => feedback.id)),
    ]);
    return feedbacks.map((feedback) =>
      this.toExperience(
        feedback,
        photos,
        avatars,
        viewerUserId,
        likes,
        visitCounts,
      ),
    );
  }

  private async experienceVisitCounts(
    feedbackIds: number[],
  ): Promise<Map<number, number>> {
    if (feedbackIds.length === 0) return new Map();
    const rows = await this.dataSource
      .getRepository(CommunityExperienceVisit)
      .createQueryBuilder('visit')
      .select('visit.idFeedback', 'feedbackId')
      .addSelect('COUNT(visit.id)', 'count')
      .where('visit.idFeedback IN (:...feedbackIds)', { feedbackIds })
      .groupBy('visit.idFeedback')
      .getRawMany<{ feedbackId: number; count: string }>();
    return new Map(
      rows.map((row) => [Number(row.feedbackId), Number(row.count) + 1]),
    );
  }

  private async experienceLikeStats(
    feedbackIds: number[],
    viewerUserId: number | null,
  ): Promise<Map<number, { count: number; liked: boolean }>> {
    if (feedbackIds.length === 0) return new Map();
    const builder = this.dataSource
      .getRepository(CommunityExperienceLike)
      .createQueryBuilder('communityLike')
      .select('communityLike.idFeedback', 'feedbackId')
      .addSelect('COUNT(communityLike.id)', 'count')
      .innerJoin('communityLike.user', 'liker')
      .innerJoin('liker.status', 'likerStatus')
      .where('communityLike.idFeedback IN (:...feedbackIds)', { feedbackIds })
      .andWhere('liker.deletedAt IS NULL')
      .andWhere('likerStatus.key = :activeLiker', { activeLiker: 'active' })
      .groupBy('communityLike.idFeedback');
    if (viewerUserId !== null) {
      builder
        .addSelect('BOOL_OR(communityLike.idUser = :viewerUserId)', 'liked')
        .setParameter('viewerUserId', viewerUserId);
    }
    const rows = await builder.getRawMany<{
      feedbackId: number;
      count: string;
      liked?: boolean;
    }>();
    return new Map(
      rows.map((row) => [
        Number(row.feedbackId),
        { count: Number(row.count), liked: row.liked ?? false },
      ]),
    );
  }

  /** Page the mixed feed before hydrating media; all predicates are shared with public listings. */
  async listFeed(query: CommunityFeedQueryDto, viewerUserId: number | null) {
    const ideas = this.publishedPlans();
    const stories = this.sharedFeedback();
    if (query.q) {
      this.searchPlans(ideas, query.q);
      this.searchExperiences(stories, query.q);
    }
    const parameters: unknown[] = [];
    const sources: string[] = [];
    const append = (
      builder: SelectQueryBuilder<Plan> | SelectQueryBuilder<Feedback>,
    ) => {
      const [sql, values]: [string, unknown[]] =
        builder.getQueryAndParameters();
      const offset = parameters.length;
      sources.push(
        `SELECT id, kind, at FROM (${sql.replace(
          /\$(\d+)/g,
          (_, index: string) => `$${Number(index) + offset}`,
        )}) feed_source`,
      );
      parameters.push(...values);
    };
    if (query.type !== 'experiences')
      append(
        ideas
          .select('plan.id', 'id')
          .addSelect("'plan'::text", 'kind')
          .addSelect('plan.updatedAt', 'at')
          .distinct(true),
      );
    if (query.type !== 'plans')
      append(
        stories
          .select('feedback.id', 'id')
          .addSelect("'experience'::text", 'kind')
          .addSelect('COALESCE(feedback.sharedAt, feedback.createdAt)', 'at')
          .distinct(true),
      );
    parameters.push(query.limit, (query.page - 1) * query.limit);
    const [page] = await this.dataSource.query<
      {
        total: string;
        items: { id: number; kind: 'plan' | 'experience' }[];
      }[]
    >(
      `WITH feed AS (${sources.join(' UNION ALL ')})
      SELECT (SELECT COUNT(*) FROM feed) AS total,
        COALESCE((SELECT json_agg(row_to_json(item)) FROM (
          SELECT id, kind FROM feed ORDER BY at DESC, kind ASC, id DESC
          LIMIT $${parameters.length - 1} OFFSET $${parameters.length}
        ) item), '[]'::json) AS items`,
      parameters,
    );
    const selected = page?.items ?? [];
    const planIds = selected
      .filter((item) => item.kind === 'plan')
      .map((item) => item.id);
    const storyIds = selected
      .filter((item) => item.kind === 'experience')
      .map((item) => item.id);
    // Recheck visibility during hydration rather than returning stale private snapshots.
    const [plans, feedbacks] = await Promise.all([
      planIds.length
        ? this.publishedPlans()
            .andWhere('plan.id IN (:...ids)', { ids: planIds })
            .getMany()
        : [],
      storyIds.length
        ? this.sharedFeedback()
            .andWhere('feedback.id IN (:...ids)', { ids: storyIds })
            .getMany()
        : [],
    ]);
    const [planCards, experiences] = await Promise.all([
      this.toPlanCards(plans),
      this.experienceCards(feedbacks, viewerUserId),
    ]);
    const cards = new Map<string, CommunityFeedItemDto>([
      ...planCards.map((plan): [string, CommunityFeedItemDto] => [
        `plan:${plan.id}`,
        { kind: 'plan', plan },
      ]),
      ...experiences.map((experience): [string, CommunityFeedItemDto] => [
        `experience:${experience.id}`,
        { kind: 'experience', experience },
      ]),
    ]);
    const data = selected.flatMap((item) => {
      const card = cards.get(`${item.kind}:${item.id}`);
      return card ? [card] : [];
    });
    return createPaginatedResponse(
      data,
      Number(page?.total ?? 0),
      query.page,
      query.limit,
    );
  }

  async getCreator(username: string) {
    const user = await this.findActiveCreator(username);
    const avatar = await this.dataSource.getRepository(UserAvatar).findOne({
      where: { idUser: user.id, isCurrent: true },
    });
    const plans = await this.dataSource
      .getRepository(Plan)
      .createQueryBuilder('plan')
      .innerJoin('plan.status', 'status')
      .innerJoin('plan.user', 'creator')
      .where('plan.idUser = :userId', { userId: user.id })
      .andWhere('plan.kind = :kind', { kind: PlanKind.Authored })
      .andWhere('plan.visibility = :visibility', {
        visibility: PlanVisibility.Public,
      })
      .andWhere('plan.communityStatus = :published', {
        published: ContentStatus.Published,
      })
      .andWhere('plan.deletedAt IS NULL')
      .andWhere('status.key != :cancelled', { cancelled: 'cancelled' })
      .andWhere('creator.username IS NOT NULL')
      .getCount();
    const experiences = await this.sharedFeedback()
      .andWhere('outing.idUser = :userId', { userId: user.id })
      .getCount();
    return {
      username: user.username,
      bio: user.bio,
      avatarUrl: avatar ? `/api/media/avatar/${avatar.id}` : null,
      planCount: plans,
      experienceCount: experiences,
      memberSince: user.createdAt,
      adaptationsReceived: await this.countAdaptations(user.id),
      tasteTags: await this.tasteTags(user.id),
      likeCount: await this.creatorLikeCount(user.id),
    };
  }

  /** Published plans by other people that were adapted from this person's. */
  private async countAdaptations(userId: number): Promise<number> {
    return this.dataSource
      .getRepository(Plan)
      .createQueryBuilder('derived')
      .innerJoin('derived.inspiredByPlan', 'original')
      .innerJoin('derived.status', 'status')
      .where('original.idUser = :userId', { userId })
      .andWhere('derived.idUser != :userId', { userId })
      .andWhere('derived.visibility = :visibility', {
        visibility: PlanVisibility.Public,
      })
      .andWhere('derived.communityStatus = :published', {
        published: ContentStatus.Published,
      })
      .andWhere('derived.deletedAt IS NULL')
      .andWhere('status.key != :cancelled', { cancelled: 'cancelled' })
      .getCount();
  }

  /**
   * What a person gravitates to, read from the categories of the stops in
   * their published plans. Nothing is declared or invented: no plans, no taste.
   */
  private async tasteTags(userId: number): Promise<string[]> {
    const rows = await this.dataSource
      .getRepository(PlanDetail)
      .createQueryBuilder('detail')
      .innerJoin('detail.plan', 'plan')
      .innerJoin('plan.status', 'status')
      .innerJoin('detail.activity', 'activity')
      .innerJoin('activity.categories', 'link')
      .innerJoin('link.category', 'category')
      .select('category.name', 'name')
      .addSelect('COUNT(*)', 'count')
      .where('plan.idUser = :userId', { userId })
      .andWhere('plan.kind = :kind', { kind: PlanKind.Authored })
      .andWhere('plan.visibility = :visibility', {
        visibility: PlanVisibility.Public,
      })
      .andWhere('plan.communityStatus = :published', {
        published: ContentStatus.Published,
      })
      .andWhere('plan.deletedAt IS NULL')
      .andWhere('status.key != :cancelled', { cancelled: 'cancelled' })
      .groupBy('category.name')
      .orderBy('COUNT(*)', 'DESC')
      .addOrderBy('category.name', 'ASC')
      .limit(4)
      .getRawMany<{ name: string }>();
    return rows.map((row) => row.name);
  }

  /** People who have something public: a published plan or a shared experience. */
  async listCreators(limit: number): Promise<CommunityCreatorSummaryDto[]> {
    const planRows = await this.dataSource
      .getRepository(Plan)
      .createQueryBuilder('plan')
      .innerJoin('plan.status', 'status')
      .innerJoin('plan.user', 'creator')
      .select('plan.idUser', 'userId')
      .addSelect('COUNT(*)', 'count')
      .where('plan.kind = :kind', { kind: PlanKind.Authored })
      .andWhere('plan.visibility = :visibility', {
        visibility: PlanVisibility.Public,
      })
      .andWhere('plan.communityStatus = :published', {
        published: ContentStatus.Published,
      })
      .andWhere('plan.deletedAt IS NULL')
      .andWhere('status.key != :cancelled', { cancelled: 'cancelled' })
      .andWhere('creator.deletedAt IS NULL')
      .andWhere('creator.username IS NOT NULL')
      .groupBy('plan.idUser')
      .getRawMany<{ userId: number; count: string }>();
    const experienceRows = await this.sharedFeedback()
      .select('outing.idUser', 'userId')
      .addSelect('COUNT(feedback.id)', 'count')
      .andWhere('author.username IS NOT NULL')
      .groupBy('outing.idUser')
      .getRawMany<{ userId: number; count: string }>();

    const totals = new Map<number, { plans: number; experiences: number }>();
    for (const row of planRows)
      totals.set(Number(row.userId), {
        plans: Number(row.count),
        experiences: 0,
      });
    for (const row of experienceRows) {
      const entry = totals.get(Number(row.userId)) ?? {
        plans: 0,
        experiences: 0,
      };
      entry.experiences = Number(row.count);
      totals.set(Number(row.userId), entry);
    }
    const likedRows = await this.sharedFeedback()
      .innerJoin(
        CommunityExperienceLike,
        'communityLike',
        'communityLike.idFeedback = feedback.id',
      )
      .innerJoin('communityLike.user', 'liker')
      .innerJoin('liker.status', 'likerStatus')
      .select('outing.idUser', 'userId')
      .addSelect('COUNT(communityLike.id)', 'likeCount')
      .andWhere('author.username IS NOT NULL')
      .andWhere('liker.deletedAt IS NULL')
      .andWhere('likerStatus.key = :activeLiker', { activeLiker: 'active' })
      .groupBy('outing.idUser')
      .getRawMany<{ userId: number; likeCount: string }>();
    const likesByUser = new Map(
      likedRows.map((row) => [Number(row.userId), Number(row.likeCount)]),
    );
    const ranked = [...totals.entries()]
      .map(([id, content]) => ({
        id,
        ...content,
        likeCount: likesByUser.get(id) ?? 0,
      }))
      .filter((person) => person.likeCount > 0)
      .sort(
        (a, b) =>
          b.likeCount - a.likeCount ||
          b.experiences - a.experiences ||
          a.id - b.id,
      )
      .slice(0, limit);
    if (ranked.length === 0) return [];

    const users = await this.dataSource
      .getRepository(User)
      .createQueryBuilder('user')
      .innerJoin('user.status', 'status')
      .where('user.id IN (:...ids)', { ids: ranked.map(({ id }) => id) })
      .andWhere('user.deletedAt IS NULL')
      .andWhere('user.username IS NOT NULL')
      .andWhere('status.key = :active', { active: 'active' })
      .getMany();
    const avatars = await this.avatarUrls(users.map((user) => user.id));
    const byId = new Map(users.map((user) => [user.id, user]));
    return ranked.flatMap(({ id, plans, experiences, likeCount }) => {
      const user = byId.get(id);
      return user?.username
        ? [
            {
              username: user.username,
              bio: user.bio,
              avatarUrl: avatars.get(user.id) ?? null,
              planCount: plans,
              experienceCount: experiences,
              likeCount,
            },
          ]
        : [];
    });
  }

  /** Only public, consented reviews contribute to a person's reputation. */
  private async creatorLikeCount(userId: number): Promise<number> {
    const row = await this.sharedFeedback()
      .innerJoin(
        CommunityExperienceLike,
        'communityLike',
        'communityLike.idFeedback = feedback.id',
      )
      .innerJoin('communityLike.user', 'liker')
      .innerJoin('liker.status', 'likerStatus')
      .select('COUNT(communityLike.id)', 'count')
      .andWhere('outing.idUser = :userId', { userId })
      .andWhere('liker.deletedAt IS NULL')
      .andWhere('likerStatus.key = :activeLiker', { activeLiker: 'active' })
      .getRawOne<{ count: string }>();
    return Number(row?.count ?? 0);
  }

  /** Like/unlike is idempotent and only accepts an explicitly shared review. */
  async setExperienceLike(
    experienceId: number,
    userId: number,
    liked: boolean,
  ): Promise<{ liked: boolean; likeCount: number }> {
    const experience = await this.sharedFeedback()
      .andWhere('feedback.id = :experienceId', { experienceId })
      .getOne();
    if (!experience) {
      throw new NotFoundException({
        code: 'EXPERIENCE_NOT_FOUND',
        message: 'La experiencia solicitada no existe',
      });
    }
    if (experience.plan.idUser === userId) {
      throw new ConflictException({
        code: 'OWN_EXPERIENCE_LIKE',
        message: 'No podés indicar que te gusta tu propia experiencia',
      });
    }
    const likes = this.dataSource.getRepository(CommunityExperienceLike);
    if (liked) {
      await likes
        .createQueryBuilder()
        .insert()
        .values({ idFeedback: experienceId, idUser: userId })
        .orIgnore()
        .execute();
    } else {
      await likes.delete({ idFeedback: experienceId, idUser: userId });
    }
    return {
      liked,
      likeCount: await this.visibleLikeCount(experienceId),
    };
  }

  private visibleLikeCount(experienceId: number): Promise<number> {
    return this.dataSource
      .getRepository(CommunityExperienceLike)
      .createQueryBuilder('communityLike')
      .innerJoin('communityLike.user', 'liker')
      .innerJoin('liker.status', 'likerStatus')
      .where('communityLike.idFeedback = :experienceId', { experienceId })
      .andWhere('liker.deletedAt IS NULL')
      .andWhere('likerStatus.key = :activeLiker', { activeLiker: 'active' })
      .getCount();
  }

  /**
   * The cards of a page of published plans. Stops, experience and adaptation
   * counts come in one query each, never one per card.
   */
  private async toPlanCards(plans: Plan[]): Promise<CommunityPlanCardDto[]> {
    if (plans.length === 0) return [];
    const ids = plans.map((plan) => plan.id);
    const [details, experienceRows, adaptationRows, avatars, images] =
      await Promise.all([
        this.dataSource.getRepository(PlanDetail).find({
          where: { idPlan: In(ids) },
          relations: { activity: true, place: true },
          order: { order: 'ASC' },
        }),
        this.dataSource
          .getRepository(Feedback)
          .createQueryBuilder('feedback')
          .innerJoin('feedback.plan', 'outing')
          .innerJoin('outing.user', 'author')
          .innerJoin('author.status', 'authorStatus')
          .innerJoin('outing.status', 'outingStatus')
          .select('outing.idSourcePlan', 'planId')
          .addSelect('COUNT(feedback.id)', 'count')
          .addSelect('AVG(feedback.rating)', 'average')
          .where('outing.idSourcePlan IN (:...ids)', { ids })
          .andWhere('outingStatus.key = :completed', { completed: 'completed' })
          .andWhere('outing.completedAt IS NOT NULL')
          .andWhere('outing.kind = :kind', { kind: PlanKind.Outing })
          .andWhere('outing.deletedAt IS NULL')
          .andWhere('author.deletedAt IS NULL')
          .andWhere('authorStatus.key = :active', { active: 'active' })
          .andWhere('feedback.isShared = true')
          .andWhere('feedback.communityConsentVersion = :consentVersion', {
            consentVersion: 1,
          })
          .andWhere('feedback.deletedAt IS NULL')
          .groupBy('outing.idSourcePlan')
          .getRawMany<{
            planId: number;
            count: string;
            average: string | null;
          }>(),
        this.dataSource
          .getRepository(Plan)
          .createQueryBuilder('derived')
          .innerJoin('derived.status', 'status')
          .innerJoin('derived.user', 'derivedAuthor')
          .innerJoin('derivedAuthor.status', 'derivedAuthorStatus')
          .select('derived.idInspiredByPlan', 'planId')
          .addSelect('COUNT(*)', 'count')
          .where('derived.idInspiredByPlan IN (:...ids)', { ids })
          .andWhere('derived.kind = :kind', { kind: PlanKind.Authored })
          .andWhere('derived.visibility = :visibility', {
            visibility: PlanVisibility.Public,
          })
          .andWhere('derived.communityStatus = :published', {
            published: ContentStatus.Published,
          })
          .andWhere('derived.deletedAt IS NULL')
          .andWhere('status.key != :cancelled', { cancelled: 'cancelled' })
          .andWhere('derivedAuthorStatus.key = :active', { active: 'active' })
          .andWhere('derivedAuthor.deletedAt IS NULL')
          .groupBy('derived.idInspiredByPlan')
          .getRawMany<{ planId: number; count: string }>(),
        this.avatarUrls(plans.map((plan) => plan.idUser)),
        this.dataSource.query<{ id: number; imageUrl: string | null }[]>(
          `SELECT "plan"."id" AS "id", ${PLAN_IMAGE_URL_SQL} AS "imageUrl" FROM "plan" "plan" WHERE "plan"."id" = ANY($1::int[])`,
          [ids],
        ),
      ]);
    const imageOf = new Map(
      images.map((row) => [Number(row.id), row.imageUrl]),
    );
    const stopsOf = new Map<number, string[]>();
    for (const detail of details) {
      const name = detail.activity?.name ?? detail.place?.name;
      if (name)
        stopsOf.set(detail.idPlan, [
          ...(stopsOf.get(detail.idPlan) ?? []),
          name,
        ]);
    }
    const experienceCounts = new Map(
      experienceRows.map((row) => [Number(row.planId), Number(row.count)]),
    );
    const experienceRatings = new Map(
      experienceRows.map((row) => [
        Number(row.planId),
        row.average === null ? null : Math.round(Number(row.average) * 10) / 10,
      ]),
    );
    const adaptationCounts = new Map(
      adaptationRows.map((row) => [Number(row.planId), Number(row.count)]),
    );
    return plans.map((plan) => {
      const inspiration = this.isPublicInspiration(plan.inspiredByPlan)
        ? plan.inspiredByPlan
        : null;
      return {
        id: plan.id,
        title: plan.title,
        description: plan.description,
        estimatedTotalCost: plan.estimatedTotalCost,
        estimatedTotalCostMax: plan.estimatedTotalCostMax,
        priceCompleteness: plan.priceCompleteness,
        estimatedTotalDuration: plan.estimatedTotalDuration,
        imageUrl: imageOf.get(plan.id) ?? null,
        imageSource: imageSourceOf(imageOf.get(plan.id)),
        peopleCount: plan.peopleCount,
        stops: stopsOf.get(plan.id) ?? [],
        experienceCount: experienceCounts.get(plan.id) ?? 0,
        sharedAverageRating: experienceRatings.get(plan.id) ?? null,
        adaptationCount: adaptationCounts.get(plan.id) ?? 0,
        authorUsername: plan.user?.username ?? null,
        authorAvatarUrl: avatars.get(plan.idUser) ?? null,
        inspiredBy: inspiration
          ? {
              id: inspiration.id,
              title: inspiration.title,
              creatorUsername: inspiration.user?.username ?? null,
            }
          : null,
      };
    });
  }

  async listCreatorPlans(username: string, query: CommunityQueryDto) {
    const user = await this.findActiveCreator(username);
    const builder = this.publishedPlans().andWhere('plan.idUser = :userId', {
      userId: user.id,
    });
    return this.pageOfPlanCards(builder, query);
  }

  async listCommunityPlans(query: CommunityQueryDto) {
    return this.pageOfPlanCards(this.publishedPlans(), query);
  }

  /**
   * The published plans other people adapted from one plan: one level, flat.
   * A plan that is not itself published has no public adaptations to show.
   */
  async listAdaptations(planId: number, query: CommunityQueryDto) {
    const original = await this.dataSource.getRepository(Plan).findOne({
      where: { id: planId },
      relations: { status: true, user: { status: true } },
    });
    if (!original || !this.isPublicInspiration(original))
      throw new NotFoundException({
        code: 'PLAN_NOT_FOUND',
        message: 'El plan solicitado no existe',
      });
    const builder = this.publishedPlans().andWhere(
      'plan.idInspiredByPlan = :planId',
      { planId },
    );
    return this.pageOfPlanCards(builder, query);
  }

  /** The published plans others adapted from any of this person's plans. */
  async listInspired(username: string, query: CommunityQueryDto) {
    const user = await this.findActiveCreator(username);
    const builder = this.publishedPlans()
      .andWhere('inspiration.idUser = :userId', { userId: user.id })
      .andWhere('plan.idUser != :userId', { userId: user.id })
      // What was adapted must itself still be public.
      .andWhere('inspiration.visibility = :visibility')
      .andWhere('inspiration.communityStatus = :published')
      .andWhere('inspirationStatus.key != :cancelled');
    return this.pageOfPlanCards(builder, query);
  }

  private async findActiveCreator(username: string): Promise<User> {
    const user = await this.dataSource
      .getRepository(User)
      .createQueryBuilder('user')
      .innerJoin('user.status', 'userStatus')
      .where('LOWER(user.username) = LOWER(:username)', { username })
      .andWhere('user.deletedAt IS NULL')
      .andWhere('userStatus.key = :active', { active: 'active' })
      .getOne();
    if (!user)
      throw new NotFoundException({
        code: 'CREATOR_NOT_FOUND',
        message: 'No encontramos este perfil',
      });
    return user;
  }

  /**
   * What the community may list as an idea: authored, published by its
   * author, not cancelled or removed, by an active account. Every listing
   * starts here, so none can drift from the others.
   */
  private publishedPlans(): SelectQueryBuilder<Plan> {
    return this.dataSource
      .getRepository(Plan)
      .createQueryBuilder('plan')
      .innerJoin('plan.status', 'status')
      .innerJoinAndSelect('plan.user', 'author')
      .innerJoin('author.status', 'authorStatus')
      .leftJoinAndSelect('plan.inspiredByPlan', 'inspiration')
      .leftJoinAndSelect('inspiration.status', 'inspirationStatus')
      .leftJoinAndSelect('inspiration.user', 'inspirationAuthor')
      .leftJoinAndSelect('inspirationAuthor.status', 'inspirationAuthorStatus')
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
  }

  private async pageOfPlanCards(
    builder: SelectQueryBuilder<Plan>,
    query: CommunityQueryDto,
  ) {
    if (query.q) this.searchPlans(builder, query.q);
    const reviewCount = `(
      SELECT COUNT(review."id") FROM "feedback" review
      INNER JOIN "plan" outing ON outing."id" = review."id_plan"
      INNER JOIN "plan_status" outing_status ON outing_status."id" = outing."id_plan_status"
      INNER JOIN "user" reviewer ON reviewer."id" = outing."id_user"
      INNER JOIN "user_status" reviewer_status ON reviewer_status."id" = reviewer."id_user_status"
      WHERE outing."id_source_plan" = plan."id"
        AND outing."kind" = 'outing' AND outing_status."key" = 'completed'
        AND outing."completed_at" IS NOT NULL AND outing."deleted_at" IS NULL
        AND reviewer."deleted_at" IS NULL AND reviewer_status."key" = 'active'
        AND review."deleted_at" IS NULL
        AND review."is_shared" = true AND review."community_consent_version" = 1
    )`;
    const reviewScore = `(
      SELECT AVG(review."rating") FROM "feedback" review
      INNER JOIN "plan" outing ON outing."id" = review."id_plan"
      INNER JOIN "plan_status" outing_status ON outing_status."id" = outing."id_plan_status"
      INNER JOIN "user" reviewer ON reviewer."id" = outing."id_user"
      INNER JOIN "user_status" reviewer_status ON reviewer_status."id" = reviewer."id_user_status"
      WHERE outing."id_source_plan" = plan."id"
        AND outing."kind" = 'outing' AND outing_status."key" = 'completed'
        AND outing."completed_at" IS NOT NULL AND outing."deleted_at" IS NULL
        AND reviewer."deleted_at" IS NULL AND reviewer_status."key" = 'active'
        AND review."deleted_at" IS NULL
        AND review."is_shared" = true AND review."community_consent_version" = 1
    )`;
    const reviewLikes = `(
      SELECT COUNT(review_like."id") FROM "community_experience_like" review_like
      INNER JOIN "feedback" review ON review."id" = review_like."id_feedback"
      INNER JOIN "user" liker ON liker."id" = review_like."id_user"
      INNER JOIN "user_status" liker_status ON liker_status."id" = liker."id_user_status"
      INNER JOIN "plan" outing ON outing."id" = review."id_plan"
      INNER JOIN "plan_status" outing_status ON outing_status."id" = outing."id_plan_status"
      INNER JOIN "user" reviewer ON reviewer."id" = outing."id_user"
      INNER JOIN "user_status" reviewer_status ON reviewer_status."id" = reviewer."id_user_status"
      WHERE outing."id_source_plan" = plan."id"
        AND outing."kind" = 'outing' AND outing_status."key" = 'completed'
        AND outing."completed_at" IS NOT NULL AND outing."deleted_at" IS NULL
        AND reviewer."deleted_at" IS NULL AND reviewer_status."key" = 'active'
        AND liker."deleted_at" IS NULL AND liker_status."key" = 'active'
        AND review."deleted_at" IS NULL
        AND review."is_shared" = true AND review."community_consent_version" = 1
    )`;
    if (query.sort === 'popular') {
      builder
        .addSelect(reviewLikes, 'community_review_likes')
        .addSelect(reviewCount, 'community_review_count')
        .addSelect(reviewScore, 'community_review_score')
        .orderBy('community_review_likes', 'DESC')
        .addOrderBy('community_review_count', 'DESC')
        .addOrderBy('community_review_score', 'DESC', 'NULLS LAST');
    } else if (query.sort === 'highest_rated') {
      builder
        .addSelect(reviewScore, 'community_review_score')
        .addSelect(reviewCount, 'community_review_count')
        .orderBy('community_review_score', 'DESC', 'NULLS LAST')
        .addOrderBy('community_review_count', 'DESC');
    } else if (query.sort === 'most_reviewed') {
      builder
        .addSelect(reviewCount, 'community_review_count')
        .addSelect(reviewScore, 'community_review_score')
        .orderBy('community_review_count', 'DESC')
        .addOrderBy('community_review_score', 'DESC', 'NULLS LAST');
    } else {
      builder.orderBy('plan.updatedAt', 'DESC');
    }
    const [plans, total] = await builder
      .addOrderBy('plan.id', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return createPaginatedResponse(
      await this.toPlanCards(plans),
      total,
      query.page,
      query.limit,
    );
  }

  private searchPlans(builder: SelectQueryBuilder<Plan>, q: string): void {
    builder
      .andWhere(
        `${searchableTextSql([
          'plan.title',
          'plan.description',
          'communityDetail.action',
          'communityPlace.name',
          'communityPlace.address',
          'communityCity.name',
          'communityActivity.name',
          'communityActivity.description',
          'communityActivityPlace.name',
          'communityActivityPlace.address',
          'communityActivityCity.name',
        ])} ILIKE :term`,
        { term: likeTerm(q) },
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

  async findCommunityExperience(id: number, viewerUserId: number | null) {
    const feedback = await this.sharedFeedback()
      .andWhere('feedback.id = :id', { id })
      .getOne();
    if (!feedback)
      throw new NotFoundException({
        code: 'EXPERIENCE_NOT_FOUND',
        message: 'La experiencia no existe',
      });
    const [experience] = await this.experienceCards([feedback], viewerUserId);
    return experience;
  }

  /** Adds one real, distinct completed outing to the author's public total. */
  async addCommunityExperienceVisit(feedbackId: number, userId: number) {
    return this.dataSource.transaction(async (manager) => {
      const canonical = await manager
        .getRepository(Feedback)
        .createQueryBuilder('feedback')
        .where('feedback.id = :feedbackId', { feedbackId })
        .andWhere('feedback.isShared = true')
        .andWhere('feedback.idCommunityAuthor = :userId', { userId })
        .andWhere('feedback.idCommunityPlan IS NOT NULL')
        .setLock('pessimistic_write')
        .getOne();
      if (!canonical) {
        throw new NotFoundException({
          code: 'EXPERIENCE_NOT_FOUND',
          message: 'No encontramos una experiencia propia para actualizar',
        });
      }

      const visits = manager.getRepository(CommunityExperienceVisit);
      const visitCount =
        (await visits.count({ where: { idFeedback: canonical.id } })) + 1;
      if (visitCount >= MAX_COMMUNITY_EXPERIENCE_VISITS) {
        throw new ConflictException({
          code: 'EXPERIENCE_VISIT_LIMIT_REACHED',
          message:
            'Esta experiencia ya alcanzó el máximo de 100 salidas registradas',
        });
      }

      const outing = await manager
        .getRepository(Plan)
        .createQueryBuilder('outing')
        .innerJoin('outing.status', 'status')
        .leftJoin(
          CommunityExperienceVisit,
          'visit',
          'visit.idOuting = outing.id',
        )
        .where('outing.idUser = :userId', { userId })
        .andWhere('outing.kind = :kind', { kind: PlanKind.Outing })
        .andWhere('outing.idSourcePlan = :sourcePlanId', {
          sourcePlanId: canonical.idCommunityPlan,
        })
        .andWhere('outing.id != :canonicalOutingId', {
          canonicalOutingId: canonical.idPlan,
        })
        .andWhere('outing.completedAt IS NOT NULL')
        .andWhere('outing.deletedAt IS NULL')
        .andWhere('status.key = :completed', { completed: 'completed' })
        .andWhere('visit.id IS NULL')
        .orderBy('outing.completedAt', 'DESC')
        .addOrderBy('outing.id', 'DESC')
        .setLock('pessimistic_write', undefined, ['outing'])
        .getOne();
      if (!outing) {
        throw new ConflictException({
          code: 'NO_UNCOUNTED_COMPLETED_OUTING',
          message:
            'Para sumar otra salida, primero completá este plan de nuevo.',
        });
      }

      await visits.insert({ idFeedback: canonical.id, idOuting: outing.id });
      return { visitCount: visitCount + 1 };
    });
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
      .andWhere('outing.completedAt IS NOT NULL')
      .andWhere('feedback.deletedAt IS NULL');
    if (planId !== undefined) {
      builder.andWhere('outing.idSourcePlan = :planId', { planId });
    } else {
      builder.andWhere('feedback.communityConsentVersion = :consentVersion', {
        consentVersion: 1,
      });
    }
    return builder;
  }

  private toExperience(
    feedback: Feedback,
    photos: Map<number, PlanImage[]>,
    avatars: Map<number, string>,
    viewerUserId: number | null,
    likes: Map<number, { count: number; liked: boolean }>,
    visitCounts: Map<number, number>,
  ): ExperienceDto {
    const source = feedback.plan.sourcePlan;
    const livedFrom = this.isPublicInspiration(source) ? source : null;
    const original = this.isPublicInspiration(livedFrom?.inspiredByPlan)
      ? livedFrom.inspiredByPlan
      : null;
    return {
      id: feedback.id,
      rating: feedback.rating,
      likeCount: likes.get(feedback.id)?.count ?? 0,
      visitCount: visitCounts.get(feedback.id) ?? 1,
      likedByViewer: likes.get(feedback.id)?.liked ?? false,
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
      // The plan it was lived from, only while that plan is public.
      plan: livedFrom
        ? {
            id: livedFrom.id,
            title: livedFrom.title,
            creatorUsername: livedFrom.user?.username ?? null,
          }
        : null,
      // The original that plan itself came from: one level, never a tree.
      inspiredBy: original
        ? {
            id: original.id,
            title: original.title,
            creatorUsername: original.user?.username ?? null,
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
