import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { UserAvatar } from '../media/entities/media-images.entity';
import { imageSourceOf } from '../media/image-source';
import { Feedback } from '../recommendation/entities/feedback.entity';
import { PlanRequest } from '../recommendation/entities/plan-request.entity';
import { Plan, PlanKind, PlanVisibility } from '../plans/entities/plan.entity';
import type { CommunityPlanCardDto } from '../plans/dto/experience-response.dto';
import { ContentStatus } from '../common/moderation/content-status';
import type { PriceCompleteness } from '../common/pricing/price';
import type { PlanCandidate } from './candidate';
import { EXPERIENCES, type ExperienceKey } from './intent/experiences';
import { radiusForTolerance } from './intent/build-intent';
import type { PlanIntent } from './intent/plan-intent';
import {
  evaluateCommunityItinerary,
  type CommunityItineraryEvaluation,
} from './community-plan-ranking';
import { PersonalSignalsService } from './ranking/personal-signals.service';
import { CandidateRetrievalService } from './retrieval/candidate-retrieval.service';
import { PLAN_IMAGE_URL_SQL } from '../plans/plan-summary.sql';

export interface CommunityPlanRecommendationDto extends CommunityPlanCardDto {
  currentPriceMin: number | null;
  currentPriceMax: number | null;
  sharedAverageRating: number | null;
  sharedExperienceCount: number;
  latestExperienceAt: string | null;
  decisionGrade: boolean;
  matchReasons: string[];
  uncertainties: string[];
}

export interface ResultRecommendationSourceDto {
  source: 'generated' | 'community';
  planId: number;
}

export interface PlanRequestRecommendationsDto {
  primary: ResultRecommendationSourceDto | null;
  community: CommunityPlanRecommendationDto[];
}

interface ExperienceSignals {
  planId: number;
  averageRating: number;
  count: number;
  latestAt: Date;
}

interface ScoredPlan {
  plan: Plan;
  evaluation: CommunityItineraryEvaluation;
  social: ExperienceSignals | null;
  score: number;
}

const COMMUNITY_CANDIDATE_LIMIT = 160;
const MAX_COMMUNITY_RESULTS = 3;
const MINIMUM_REQUEST_RELEVANCE = 0.58;
const COMMUNITY_IMPLICIT_LOCATION_RADIUS_KM = 25;
const EXPERIENCE_KEYS = Object.keys(EXPERIENCES) as ExperienceKey[];

/**
 * A profile/default area helps the generated plan start somewhere familiar,
 * but it was not a location the person asked us to enforce. Give community
 * ideas a little more room to surface across the Mendoza metro area. A place
 * or region named in the request remains the same hard boundary.
 */
function communityMatchingIntent(intent: PlanIntent): PlanIntent {
  const source = intent.provenance.location ?? 'default';
  const namedLocation = ['explicit', 'text', 'model'].includes(source);
  const hasDefaultArea =
    intent.location.latitude !== null ||
    intent.location.idDepartment !== null ||
    intent.location.region !== null;
  if (!hasDefaultArea || namedLocation || intent.location.region) return intent;

  const currentRadius =
    intent.location.radiusKm ??
    radiusForTolerance(intent.location.travelTolerance);
  if (currentRadius >= COMMUNITY_IMPLICIT_LOCATION_RADIUS_KM) return intent;
  return {
    ...intent,
    location: {
      ...intent.location,
      radiusKm: COMMUNITY_IMPLICIT_LOCATION_RADIUS_KM,
    },
  };
}

export function sharedExperienceScore(
  signal: ExperienceSignals | null,
  now: Date,
): number {
  if (!signal) return 0;
  // Shrink a small sample toward a neutral 3.8 rating, as the place ranker does.
  const quality =
    (signal.averageRating * signal.count + 3.8 * 8) / (signal.count + 8);
  const quality01 = Math.max(0, Math.min(1, (quality - 2.5) / 2.5));
  const ageDays = Math.max(
    0,
    (now.getTime() - signal.latestAt.getTime()) / 86_400_000,
  );
  const freshness = Math.exp(-ageDays / 180);
  return 0.035 * quality01 + 0.02 * freshness;
}

export function compareRecommendationEvidence(
  a: { decisionGrade: boolean; score: number; id: number },
  b: { decisionGrade: boolean; score: number; id: number },
): number {
  return (
    Number(b.decisionGrade) - Number(a.decisionGrade) ||
    b.score - a.score ||
    a.id - b.id
  );
}

// The status of a generated request is polled and reopened; each computation
// retrieves candidates for every community plan, so a result is reused briefly.
const RECOMMENDATION_CACHE_TTL_MS = 60_000;
const RECOMMENDATION_CACHE_MAX_ENTRIES = 500;

@Injectable()
export class CommunityPlanRecommendationsService {
  private readonly cache = new Map<
    string,
    { value: Promise<PlanRequestRecommendationsDto>; expiresAt: number }
  >();

  constructor(
    private readonly dataSource: DataSource,
    private readonly candidateRetrieval: CandidateRetrievalService,
    private readonly personalSignals: PersonalSignalsService,
  ) {}

  recommend(
    request: PlanRequest,
    generatedPlanIds: number[],
    intent = request.resolvedOptions?.intent,
  ): Promise<PlanRequestRecommendationsDto> {
    if (intent !== request.resolvedOptions?.intent)
      return this.compute(request, generatedPlanIds, intent);
    const key = `${request.id}:${generatedPlanIds.join(',')}`;
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) return cached.value;
    this.cache.delete(key);
    const value = this.compute(request, generatedPlanIds, intent);
    // A failure is not reused: the next read tries again.
    value.catch(() => this.cache.delete(key));
    this.cache.set(key, {
      value,
      expiresAt: now + RECOMMENDATION_CACHE_TTL_MS,
    });
    for (const [oldKey, entry] of this.cache)
      if (
        this.cache.size > RECOMMENDATION_CACHE_MAX_ENTRIES ||
        entry.expiresAt <= now
      )
        this.cache.delete(oldKey);
    return value;
  }

  private async compute(
    request: PlanRequest,
    generatedPlanIds: number[],
    intent: PlanIntent | undefined,
  ): Promise<PlanRequestRecommendationsDto> {
    if (!intent) return { primary: null, community: [] };
    const requestedAt = new Date();
    const matchingIntent = communityMatchingIntent(intent);
    const experiences = EXPERIENCE_KEYS;
    const [retrieval, personal] = await Promise.all([
      this.candidateRetrieval.retrieve(
        matchingIntent,
        experiences,
        null,
        requestedAt,
        false,
        false,
        true,
      ),
      request.idUser
        ? this.personalSignals.load(request.idUser, requestedAt)
        : Promise.resolve(undefined),
    ]);
    if (!retrieval.candidates.length) return { primary: null, community: [] };

    const communityPlans = await this.communityPlans(
      retrieval.candidates,
      request.idUser ?? null,
    );
    const allIds = [...new Set(communityPlans.map((plan) => plan.id))];
    if (!allIds.length) return { primary: null, community: [] };
    const signals = await this.sharedExperienceSignals(allIds);
    const evaluate = (plan: Plan) => {
      const details = (plan.details ?? []).filter(
        (detail) => detail.deletedAt === null,
      );
      const evaluation = evaluateCommunityItinerary({
        stops: details.map((detail) => ({
          idActivity: detail.idActivity,
          idPlace: detail.idPlace,
          action: detail.action,
          order: detail.order,
          startMinute: detail.startMinute,
        })),
        candidates: retrieval.candidates,
        intent: matchingIntent,
        requestedAt,
        personal,
        useSavedStartTimes: false,
      });
      if (!evaluation.eligible) return null;
      const social = signals.get(plan.id) ?? null;
      if (evaluation.relevance < MINIMUM_REQUEST_RELEVANCE) return null;
      return {
        plan,
        evaluation,
        social,
        score: evaluation.score + sharedExperienceScore(social, requestedAt),
      } satisfies ScoredPlan;
    };

    const ranked = [...communityPlans.map((plan) => evaluate(plan))].filter(
      (entry): entry is ScoredPlan => entry !== null,
    );

    // Read current catalog evidence without external calls on a status read.
    ranked.sort((a, b) =>
      compareRecommendationEvidence(
        { ...a.evaluation, score: a.score, id: a.plan.id },
        { ...b.evaluation, score: b.score, id: b.plan.id },
      ),
    );
    const community = ranked.slice(0, MAX_COMMUNITY_RESULTS);
    const cards = await this.toCards(community, signals);
    return {
      primary: generatedPlanIds[0]
        ? { source: 'generated', planId: generatedPlanIds[0] }
        : null,
      community: cards,
    };
  }

  private async communityPlans(
    candidates: PlanCandidate[],
    userId: number | null,
  ): Promise<Plan[]> {
    const activityIds = [
      ...new Set(
        candidates
          .map((candidate) => candidate.activityId)
          .filter((id): id is number => id !== null),
      ),
    ];
    const placeIds = [
      ...new Set(candidates.map((candidate) => candidate.placeId)),
    ];
    if (!activityIds.length && !placeIds.length) return [];
    const builder = this.dataSource
      .getRepository(Plan)
      .createQueryBuilder('plan')
      .innerJoinAndSelect('plan.user', 'author')
      .innerJoin('author.status', 'authorStatus')
      .innerJoin('plan.status', 'planStatus')
      .leftJoinAndSelect('plan.inspiredByPlan', 'inspiration')
      .leftJoinAndSelect('inspiration.status', 'inspirationStatus')
      .leftJoinAndSelect('inspiration.user', 'inspirationAuthor')
      .leftJoinAndSelect('inspirationAuthor.status', 'inspirationAuthorStatus')
      .leftJoinAndSelect('plan.details', 'detail')
      .leftJoinAndSelect('detail.activity', 'activity')
      .leftJoinAndSelect('detail.place', 'place')
      .where('plan.kind = :kind', { kind: PlanKind.Authored })
      .andWhere('plan.visibility = :visibility', {
        visibility: PlanVisibility.Public,
      })
      .andWhere('plan.communityStatus = :published', {
        published: ContentStatus.Published,
      })
      .andWhere('planStatus.key != :cancelled', { cancelled: 'cancelled' })
      .andWhere('plan.deletedAt IS NULL')
      .andWhere('authorStatus.key = :active', { active: 'active' })
      .andWhere('author.deletedAt IS NULL')
      .andWhere(userId === null ? '1 = 1' : 'plan.idUser != :userId', {
        userId,
      })
      .andWhere(
        `EXISTS (
        SELECT 1 FROM plan_detail candidate_detail
        WHERE candidate_detail.id_plan = plan.id
          AND candidate_detail.deleted_at IS NULL
          AND (candidate_detail.id_activity = ANY(:activityIds::int[]) OR candidate_detail.id_place = ANY(:placeIds::int[]))
      )`,
        { activityIds, placeIds },
      )
      .orderBy('plan.updatedAt', 'DESC')
      .addOrderBy('plan.id', 'DESC')
      .take(COMMUNITY_CANDIDATE_LIMIT);
    const plans = await builder.getMany();
    return plans.map((plan) => ({
      ...plan,
      details: (plan.details ?? []).filter(
        (detail) => detail.deletedAt === null,
      ),
    }));
  }

  private async sharedExperienceSignals(
    planIds: number[],
  ): Promise<Map<number, ExperienceSignals>> {
    if (!planIds.length) return new Map();
    const rows = await this.dataSource
      .getRepository(Feedback)
      .createQueryBuilder('feedback')
      .innerJoin('feedback.plan', 'outing')
      .innerJoin('outing.status', 'outingStatus')
      .innerJoin('outing.user', 'author')
      .innerJoin('author.status', 'authorStatus')
      .select('outing.idSourcePlan', 'planId')
      .addSelect('AVG(feedback.rating)', 'averageRating')
      .addSelect('COUNT(feedback.id)', 'count')
      .addSelect('MAX(outing.completedAt)', 'latestAt')
      .where('outing.idSourcePlan IN (:...planIds)', { planIds })
      .andWhere('outing.kind = :kind', { kind: PlanKind.Outing })
      .andWhere('outingStatus.key = :completed', { completed: 'completed' })
      .andWhere('outing.deletedAt IS NULL')
      .andWhere('outing.completedAt IS NOT NULL')
      .andWhere('authorStatus.key = :active', { active: 'active' })
      .andWhere('author.deletedAt IS NULL')
      .andWhere('feedback.isShared = true')
      .andWhere('feedback.communityConsentVersion = :consentVersion', {
        consentVersion: 1,
      })
      .andWhere('feedback.deletedAt IS NULL')
      .groupBy('outing.idSourcePlan')
      .getRawMany<{
        planId: number;
        averageRating: string;
        count: string;
        latestAt: Date;
      }>();
    return new Map(
      rows.map((row) => [
        Number(row.planId),
        {
          planId: Number(row.planId),
          averageRating: Number(row.averageRating),
          count: Number(row.count),
          latestAt: new Date(row.latestAt),
        },
      ]),
    );
  }

  private async toCards(
    entries: ScoredPlan[],
    signals: Map<number, ExperienceSignals>,
  ): Promise<CommunityPlanRecommendationDto[]> {
    if (!entries.length) return [];
    const ids = entries.map((entry) => entry.plan.id);
    const avatars = await this.dataSource.getRepository(UserAvatar).find({
      where: {
        idUser: In(entries.map((entry) => entry.plan.idUser)),
        isCurrent: true,
      },
    });
    const avatarByUser = new Map(
      avatars.map((avatar) => [
        avatar.idUser,
        `/api/media/avatar/${avatar.id}`,
      ]),
    );
    const images = await this.dataSource.query<
      { id: number; imageUrl: string | null }[]
    >(
      `SELECT "plan"."id" AS "id", ${PLAN_IMAGE_URL_SQL} AS "imageUrl" FROM "plan" "plan" WHERE "plan"."id" = ANY($1::int[])`,
      [ids],
    );
    const imageByPlan = new Map(
      images.map((image) => [Number(image.id), image.imageUrl]),
    );
    const [experienceCounts, adaptationCounts] = await Promise.all([
      this.dataSource
        .getRepository(Feedback)
        .createQueryBuilder('feedback')
        .innerJoin('feedback.plan', 'outing')
        .innerJoin('outing.status', 'outingStatus')
        .innerJoin('outing.user', 'author')
        .innerJoin('author.status', 'authorStatus')
        .select('outing.idSourcePlan', 'planId')
        .addSelect('COUNT(feedback.id)', 'count')
        .where('outing.idSourcePlan IN (:...ids)', { ids })
        .andWhere('outing.kind = :kind', { kind: PlanKind.Outing })
        .andWhere('outingStatus.key = :completed', { completed: 'completed' })
        .andWhere('outing.completedAt IS NOT NULL')
        .andWhere('outing.deletedAt IS NULL')
        .andWhere('authorStatus.key = :active', { active: 'active' })
        .andWhere('author.deletedAt IS NULL')
        .andWhere('feedback.isShared = true')
        .andWhere('feedback.communityConsentVersion = :consentVersion', {
          consentVersion: 1,
        })
        .andWhere('feedback.deletedAt IS NULL')
        .groupBy('outing.idSourcePlan')
        .getRawMany<{ planId: number; count: string }>(),
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
        .andWhere('status.key != :cancelled', { cancelled: 'cancelled' })
        .andWhere('derivedAuthorStatus.key = :active', { active: 'active' })
        .andWhere('derivedAuthor.deletedAt IS NULL')
        .andWhere('derived.deletedAt IS NULL')
        .groupBy('derived.idInspiredByPlan')
        .getRawMany<{ planId: number; count: string }>(),
    ]);
    const experiences = new Map(
      experienceCounts.map((row) => [Number(row.planId), Number(row.count)]),
    );
    const adaptations = new Map(
      adaptationCounts.map((row) => [Number(row.planId), Number(row.count)]),
    );
    return entries.map((entry) => {
      const { plan, evaluation } = entry;
      const signal = signals.get(plan.id);
      const stops = evaluation.stops.map(({ candidate }) => candidate.name);
      const inspiration =
        plan.inspiredByPlan &&
        plan.inspiredByPlan.kind === PlanKind.Authored &&
        plan.inspiredByPlan.visibility === PlanVisibility.Public &&
        plan.inspiredByPlan.communityStatus === ContentStatus.Published &&
        plan.inspiredByPlan.user?.status?.key === 'active' &&
        plan.inspiredByPlan.status?.key !== 'cancelled'
          ? {
              id: plan.inspiredByPlan.id,
              title: plan.inspiredByPlan.title,
              creatorUsername: plan.inspiredByPlan.user?.username ?? null,
            }
          : null;
      const totalMin = evaluation.totalMin;
      const totalMax = evaluation.totalMax;
      const completeness: PriceCompleteness =
        totalMin === null
          ? 'NONE'
          : totalMax === totalMin
            ? 'EXACT'
            : totalMax === null
              ? 'LOWER_BOUND'
              : 'RANGE';
      const card: CommunityPlanRecommendationDto = {
        id: plan.id,
        title: plan.title,
        description: plan.description,
        estimatedTotalCost: totalMin,
        estimatedTotalCostMax: totalMax,
        priceCompleteness: completeness,
        estimatedTotalDuration: evaluation.totalDuration,
        imageUrl: imageByPlan.get(plan.id) ?? null,
        imageSource: imageSourceOf(imageByPlan.get(plan.id)),
        peopleCount: plan.peopleCount,
        stops,
        experienceCount: experiences.get(plan.id) ?? 0,
        adaptationCount: adaptations.get(plan.id) ?? 0,
        authorUsername: plan.user?.username ?? null,
        authorAvatarUrl: avatarByUser.get(plan.idUser) ?? null,
        inspiredBy: inspiration,
        currentPriceMin: totalMin,
        currentPriceMax: totalMax,
        sharedAverageRating: signal?.averageRating ?? null,
        sharedExperienceCount: signal?.count ?? 0,
        latestExperienceAt: signal?.latestAt.toISOString() ?? null,
        decisionGrade: evaluation.decisionGrade,
        matchReasons: evaluation.matchReasons,
        uncertainties: evaluation.uncertainties,
      };
      return card;
    });
  }
}
