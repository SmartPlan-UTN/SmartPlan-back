import {
  assertGenerationTime,
  GENERATION_TIMEOUT_MS,
  generationNow,
  GenerationTimeoutError,
  remainingGenerationMs,
} from './generation-deadline';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Category } from '../categories/entities/category.entity';
import { Department } from '../places/entities/department.entity';
import { Plan, PlanKind } from '../plans/entities/plan.entity';
import { PlanDetail } from '../plans/entities/plan-detail.entity';
import { PermanentJobError } from '../messaging/errors/permanent-job-error';
import { GoogleMapsClientService } from '../external-integration/google-maps/google-maps-client.service';
import { CandidateActivity } from './dto/candidate-activity.dto';
import { GeminiClientService } from './gemini/gemini-client.service';
import { ComposedPlan } from './gemini/dto/compose-plans.dto';
import { GeographicResolutionService } from './geographic-resolution.service';
import {
  PlanRequest,
  PlanRequestMode,
  PlanRequestProgressStage,
  ResolvedSearchOptions,
} from './entities/plan-request.entity';
import {
  computePlanTotals,
  priceFromRow,
  snapshotValues,
  UNKNOWN_PRICE,
} from '../common/pricing/price';
import type { PriceRow } from '../common/pricing/price';
import { PlanRequestCategory } from './entities/plan-request-category.entity';
import { UserPreference } from '../users/entities/user-preference.entity';
import { UserPreferenceProfile } from '../users/entities/user-preference-profile.entity';
import { UserPreferenceProfileLookupService } from '../users/user-preference-profile-lookup.service';
import {
  matchesActivityConstraints,
  groupCost,
  TimeOfDay,
} from '../activities/activity-constraints';
import { localIntent, searchTerms } from './local-intent';
import type { TravelMode } from '../common/types/travel-mode';
import {
  SEARCH_FEEDBACK_SQL,
  SEARCH_AFFINITY_SQL,
  SEARCH_SENSITIVITY_SQL,
} from './search-feedback.sql';
import {
  CANDIDATE_POOL_LIMIT,
  deterministicPlans,
  PROMPT_CANDIDATE_LIMIT,
  shortlistCandidates,
  estimatedTravelMinutes,
} from './candidate-selection';

export type ClaimResult = 'claimed' | 'terminal' | 'skip';
type PointDepartmentResolver = (
  latitude: number,
  longitude: number,
) => Promise<number | null>;

// Optional enrichment must leave time to persist usable alternatives.
const PERSISTENCE_RESERVE_MS = 2_000;
const OPTIONAL_ROUTING_TIMEOUT_MS = 1_500;
const COMPOSITION_BUDGET_MS = 12_000;
const MIN_MODEL_ATTEMPT_MS = 1_000;

/**
 * Upper bound on how many candidate activities go into the `composePlans`
 * prompt. `findCandidateActivities` was previously unbounded — a busy
 * department's *entire* matching set was serialized into the prompt every
 * time, which is very likely the dominant token/latency cost of the two
 * Gemini calls (see W3.1's per-call instrumentation to confirm against
 * real traffic). 3-6 short alternatives never need more than a few dozen
 * real options to choose from. Starting value, not a measured one — revisit
 * once the instrumentation has real numbers.
 */
const CANDIDATE_CAP = PROMPT_CANDIDATE_LIMIT;

/**
 * How long the department/category name lists injected into every
 * `interpretIntent` call are cached in memory before being refetched. Both
 * catalogs change rarely, so a short staleness window is a fine trade for
 * skipping a DB round trip (and reserializing the same names) on every
 * automatic plan request.
 */
const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class PlanGenerationService {
  private readonly logger = new Logger(PlanGenerationService.name);

  private catalogCache: {
    departments: { id: number; name: string }[];
    categories: { id: number; name: string }[];
    expiresAt: number;
  } | null = null;

  constructor(
    @InjectRepository(PlanRequest)
    private readonly planRequests: Repository<PlanRequest>,
    @InjectRepository(Plan)
    private readonly plans: Repository<Plan>,
    private readonly dataSource: DataSource,
    private readonly gemini: GeminiClientService,
    private readonly googleMaps: GoogleMapsClientService,
    private readonly geographicResolution: GeographicResolutionService,
    private readonly preferenceProfiles: UserPreferenceProfileLookupService,
  ) {}

  /**
   * Attempts to take ownership of a plan request for processing. See the
   * plan (section 5.4/6): this is the single checkpoint that makes the
   * pipeline idempotent under at-least-once delivery and under the recovery
   * sweep introduced in a later phase.
   */
  async claim(
    planRequestId: number,
    isRetryAttempt = false,
  ): Promise<ClaimResult> {
    return this.dataSource.transaction(async (manager) => {
      const request = await manager
        .createQueryBuilder(PlanRequest, 'request')
        .setLock('pessimistic_write')
        .innerJoinAndSelect('request.status', 'status')
        .where('request.id = :planRequestId', { planRequestId })
        .getOne();

      if (!request) {
        throw new PermanentJobError(
          `PlanRequest ${planRequestId} does not exist`,
        );
      }

      if (['generated', 'failed'].includes(request.status.key)) {
        return 'terminal';
      }

      assertGenerationTime(request.requestedAt);
      const existingPlans = await manager.count(Plan, {
        where: { idPlanRequest: planRequestId },
      });
      if (existingPlans > 0) {
        // A previous attempt persisted the alternatives but died before it
        // could move the request to `generated`. Finish that transition here,
        // under the same lock, so the request never stays stuck in
        // `processing`/`pending` while its plans already exist.
        if (request.status.key !== 'generated') {
          const generatedStatusId = await this.statusIdByKey(
            manager.getRepository(PlanRequest),
            'generated',
          );
          await manager.update(PlanRequest, planRequestId, {
            idRequestStatus: generatedStatusId,
          });
        }
        return 'terminal';
      }

      if (request.status.key === 'processing') {
        // Only an explicit broker retry can reclaim a live processing slot.
        if (!isRetryAttempt) {
          return 'skip';
        }

        if (request.progressStage && request.progressStageAt) {
          this.logger.warn({
            event: 'plan_generation_stage_interrupted',
            planRequestId,
            stage: request.progressStage,
            elapsedMs: generationNow() - request.progressStageAt.getTime(),
          });
        }
      }

      const processingStatusId = await this.statusIdByKey(
        manager.getRepository(PlanRequest),
        'processing',
      );

      await manager.update(PlanRequest, planRequestId, {
        idRequestStatus: processingStatusId,
        processingStartedAt: new Date(generationNow()),
        ...(request.status.key === 'processing'
          ? { progressStage: null, progressStageAt: null }
          : {}),
      });

      return 'claimed';
    });
  }

  /**
   * If any Plan rows already exist for this request (crash after persisting,
   * before marking generated), close the request without calling any
   * external provider again.
   */
  async closeIfAlreadyGenerated(planRequestId: number): Promise<boolean> {
    const existingPlans = await this.plans.count({
      where: { idPlanRequest: planRequestId },
    });
    if (existingPlans === 0) return false;

    const generatedStatusId = await this.statusIdByKey(
      this.planRequests,
      'generated',
    );
    const updated = await this.planRequests
      .createQueryBuilder()
      .update(PlanRequest)
      .set({ idRequestStatus: generatedStatusId })
      .where('id = :id', { id: planRequestId })
      .andWhere(
        "id_request_status IN (SELECT id FROM request_status WHERE key IN ('pending', 'processing'))",
      )
      .andWhere(
        "requested_at > clock_timestamp() - (:generationTimeoutMs * interval '1 millisecond')",
        { generationTimeoutMs: GENERATION_TIMEOUT_MS },
      )
      .execute();
    return (updated.affected ?? 0) > 0;
  }

  /**
   * Interprets the request's raw query and context into normalized fields,
   * persisting them atomically together with `intentResolvedAt` so a retry
   * never repeats this call (checkpoint, plan section 4.6/6).
   *
   * Missing budget and location fall through explicit context -> Gemini's read of the
   * free text -> the user's stored `UserPreferenceProfile` -> a system
   * default (unconstrained budget, busiest department for location). A
   * missing input is never a reason to fail the request — that would defeat
   * the point of a free-text composer (CU17). If ambiguous text cannot be interpreted,
   * fail explicitly rather than silently discarding its restrictions.
   */
  async resolveIntent(planRequest: PlanRequest): Promise<PlanRequest> {
    if (planRequest.intentResolvedAt !== null) {
      return planRequest;
    }
    const points = new Map<string, Promise<number | null>>();
    const resolvePoint: PointDepartmentResolver = (latitude, longitude) => {
      const key = `${latitude},${longitude}`;
      if (!points.has(key))
        points.set(
          key,
          this.geographicResolution.nearestDepartment(latitude, longitude),
        );
      return points.get(key)!;
    };

    if (planRequest.mode === PlanRequestMode.Surprise) {
      await this.startProgressStage(planRequest, 'locating');
    } else {
      await this.startProgressStage(planRequest, 'interpreting');
    }

    const profilePromise = this.preferenceProfiles.findByUser(
      planRequest.idUser,
    );
    const catalogPromise =
      planRequest.mode === PlanRequestMode.Surprise
        ? Promise.resolve({ departments: [], categories: [] })
        : this.departmentAndCategoryCatalog();
    const [
      profile,
      { departments: candidateDepartments, categories: candidateCategories },
    ] = await Promise.all([profilePromise, catalogPromise]);

    if (planRequest.mode === PlanRequestMode.Surprise) {
      const preferredCategoryIds = await this.preferredCategoryIds(
        planRequest.idUser,
      );

      // createSurprise() already tried device coordinates, then the
      // profile's preferred area; if both were unavailable it persisted
      // idDepartment as null, and the busiest-department default below
      // closes that last gap here.
      const idDepartment =
        planRequest.idDepartment ??
        (await this.geographicResolution.departmentWithMostActiveCandidates());

      return this.persistResolvedIntent(planRequest, {
        resolvedOptions: {
          locationSource:
            planRequest.rawContext?.latitude != null
              ? 'device'
              : profile?.preferredAreaLatitude != null
                ? 'profile'
                : 'default',
          travelMode: 'drive',
          timeOfDay: null,
          categorySource: preferredCategoryIds.length ? 'preferences' : 'none',
          intentSource: 'surprise',
        },
        budget: profile?.usualBudget ?? null,
        idDepartment,
        idOutingType: null,
        availableDuration: null,
        partySize: profile?.usualPeopleCount ?? null,
        categoryIds: preferredCategoryIds,
        ...(await this.resolveSearchRadius(
          planRequest.rawContext ?? {},
          idDepartment,
          profile,
          resolvePoint,
        )),
      });
    }

    const context = (planRequest.rawContext ?? {}) as {
      budget?: number;
      idDepartment?: number;
      partySize?: number;
      availableDuration?: number;
      latitude?: number;
      longitude?: number;
      timeOfDay?: TimeOfDay;
      maxDistanceKm?: number;
      travelMode?: TravelMode;
    };

    const contextDepartmentName = context.idDepartment
      ? candidateDepartments.find((d) => d.id === context.idDepartment)?.name
      : undefined;

    const intentInput = {
      planRequestId: planRequest.id,
      rawQuery: planRequest.rawQuery ?? '',
      context: {
        budget: context.budget,
        departmentName: contextDepartmentName,
        partySize: context.partySize,
        availableDuration: context.availableDuration,
        timeOfDay: context.timeOfDay,
        maxDistanceKm: context.maxDistanceKm,
        travelMode: context.travelMode,
      },
      candidateDepartments: candidateDepartments.map((d) => ({
        id: d.id,
        name: d.name,
      })),
      candidateCategories: candidateCategories.map((c) => ({
        id: c.id,
        name: c.name,
      })),
    };
    const local = localIntent(intentInput);
    let interpreted = local.intent;
    let intentSource: ResolvedSearchOptions['intentSource'] = 'local';
    if (local.needsModel) {
      try {
        const modelIntent = await this.gemini.interpretIntent(intentInput);
        interpreted = {
          ...modelIntent,
          budget: local.intent.budget ?? modelIntent.budget,
          budgetBasis:
            local.intent.budget != null
              ? local.intent.budgetBasis
              : modelIntent.budgetBasis,
          partySize: local.intent.partySize ?? modelIntent.partySize,
          availableDuration:
            local.intent.availableDuration ?? modelIntent.availableDuration,
          departmentName:
            local.intent.departmentName ?? modelIntent.departmentName,
          timeOfDay: local.intent.timeOfDay ?? modelIntent.timeOfDay ?? null,
          maxDistanceKm:
            local.intent.maxDistanceKm ?? modelIntent.maxDistanceKm ?? null,
          travelMode: local.intent.travelMode ?? modelIntent.travelMode ?? null,
          excludedCategoryNames: [
            ...new Set([
              ...(local.intent.excludedCategoryNames ?? []),
              ...(modelIntent.excludedCategoryNames ?? []),
            ]),
          ],
        };
        intentSource = 'gemini';
      } catch (error) {
        if (error instanceof GenerationTimeoutError) throw error;
        this.logger.warn({
          event: 'intent_resolution_failed',
          planRequestId: planRequest.id,
          errorClass:
            error instanceof Error ? error.constructor.name : 'unknown',
        });
        // Local extraction reported ambiguity. Continuing could silently drop
        // constraints such as exclusions that only the model can resolve.
        throw new PermanentJobError(
          JSON.stringify({
            code: 'GENERATION_PROVIDER_UNAVAILABLE',
            provider: 'gemini',
          }),
          error,
        );
      }
    }
    this.logger.log({
      event: 'intent_resolved',
      planRequestId: planRequest.id,
      strategy: intentSource,
    });

    await this.startProgressStage(planRequest, 'locating');
    const resolvedDepartment = await this.resolveDepartment(
      {
        explicit: context.idDepartment ?? null,
        deviceLatitude: context.latitude ?? null,
        deviceLongitude: context.longitude ?? null,
        departmentName: interpreted.departmentName,
        candidateDepartments,
        profile,
      },
      resolvePoint,
    );

    const interpretedCategoryIds = candidateCategories
      .filter((category) => interpreted.categoryNames.includes(category.name))
      .map((category) => category.id);

    const resolvedPeople =
      context.partySize ??
      interpreted.partySize ??
      profile?.usualPeopleCount ??
      null;

    return this.persistResolvedIntent(planRequest, {
      resolvedOptions: {
        locationSource:
          context.idDepartment != null || interpreted.departmentName != null
            ? 'explicit'
            : context.latitude != null
              ? 'device'
              : profile?.preferredAreaLatitude != null
                ? 'profile'
                : 'default',
        travelMode: context.travelMode ?? interpreted.travelMode ?? 'drive',
        excludedCategoryIds: candidateCategories
          .filter(({ name }) =>
            interpreted.excludedCategoryNames?.includes(name),
          )
          .map(({ id }) => id),
        timeOfDay: context.timeOfDay ?? interpreted.timeOfDay ?? null,
        categorySource: interpretedCategoryIds.length
          ? 'explicit'
          : 'preferences',
        intentSource,
      },
      budget:
        context.budget ??
        (interpreted.budget == null
          ? (profile?.usualBudget ?? null)
          : Math.min(
              99999999.99,
              groupCost(
                interpreted.budget,
                interpreted.budgetBasis,
                resolvedPeople,
              ),
            )),
      idDepartment: resolvedDepartment,
      idOutingType: null,
      availableDuration:
        context.availableDuration ?? interpreted.availableDuration,
      partySize: resolvedPeople,
      categoryIds:
        interpretedCategoryIds.length > 0
          ? interpretedCategoryIds
          : await this.preferredCategoryIds(planRequest.idUser),
      ...(await this.resolveSearchRadius(
        {
          ...context,
          maxDistanceKm:
            context.maxDistanceKm ?? interpreted.maxDistanceKm ?? undefined,
        },
        resolvedDepartment,
        profile,
        resolvePoint,
      )),
    });
  }

  private async preferredCategoryIds(idUser: number): Promise<number[]> {
    const rows = await this.dataSource
      .getRepository(UserPreference)
      .createQueryBuilder('preference')
      .innerJoin(
        'preference.category',
        'category',
        'category.deleted_at IS NULL',
      )
      .innerJoin('category.status', 'status')
      .where('preference.id_user = :idUser', { idUser })
      .andWhere('status.key = :activeStatus', { activeStatus: 'active' })
      .select('preference.id_category', 'idCategory')
      .getRawMany<{ idCategory: number }>();
    return rows.map(({ idCategory }) => idCategory);
  }

  /** Snapshot the radius only around a real point in the resolved department. */
  private async resolveSearchRadius(
    context: {
      latitude?: unknown;
      longitude?: unknown;
      maxDistanceKm?: number;
    },
    idDepartment: number | null,
    profile: UserPreferenceProfile | null,
    resolvePoint: PointDepartmentResolver = (latitude, longitude) =>
      this.geographicResolution.nearestDepartment(latitude, longitude),
  ): Promise<{
    resolvedLatitude: number | null;
    resolvedLongitude: number | null;
    appliedMaxDistanceKm: number | null;
  }> {
    const empty = {
      resolvedLatitude: null,
      resolvedLongitude: null,
      appliedMaxDistanceKm: null,
    };
    const hasContextLatitude = typeof context.latitude === 'number';
    const hasContextLongitude = typeof context.longitude === 'number';
    if (hasContextLatitude !== hasContextLongitude) return empty;
    const latitude = hasContextLatitude
      ? (context.latitude as number)
      : profile?.preferredAreaLatitude;
    const longitude = hasContextLongitude
      ? (context.longitude as number)
      : profile?.preferredAreaLongitude;
    if (latitude == null || longitude == null || idDepartment == null) {
      if (context.maxDistanceKm != null)
        throw new PermanentJobError(
          JSON.stringify({ code: 'LOCATION_REQUIRED_FOR_RADIUS' }),
        );
      return empty;
    }
    const pointDepartment = await resolvePoint(latitude, longitude);
    if (pointDepartment !== idDepartment) {
      if (context.maxDistanceKm != null)
        throw new PermanentJobError(
          JSON.stringify({ code: 'LOCATION_REQUIRED_FOR_RADIUS' }),
        );
      return empty;
    }
    return {
      resolvedLatitude: latitude,
      resolvedLongitude: longitude,
      appliedMaxDistanceKm:
        context.maxDistanceKm ?? profile?.maxDistanceKm ?? 25,
    };
  }

  /**
   * Departments and active categories, cached for `CATALOG_CACHE_TTL_MS`.
   * Both are re-fetched (never invalidated by a department/category CUD
   * flow) — a short staleness window is an acceptable trade for a catalog
   * that changes rarely, and simpler than wiring cache invalidation into
   * every write path that touches either table.
   */
  private async departmentAndCategoryCatalog(): Promise<{
    departments: { id: number; name: string }[];
    categories: { id: number; name: string }[];
  }> {
    const cached = this.catalogCache;
    if (cached && cached.expiresAt > generationNow()) {
      return { departments: cached.departments, categories: cached.categories };
    }

    const [departments, categories] = await Promise.all([
      this.dataSource.getRepository(Department).find({
        select: { id: true, name: true },
      }),
      this.dataSource
        .getRepository(Category)
        .createQueryBuilder('category')
        .innerJoin('category.status', 'status')
        .where('status.key = :activeStatus', { activeStatus: 'active' })
        .select(['category.id', 'category.name'])
        .getMany(),
    ]);

    this.catalogCache = {
      departments,
      categories,
      expiresAt: generationNow() + CATALOG_CACHE_TTL_MS,
    };
    return { departments, categories };
  }

  /**
   * Location fallback chain for an automatic request (CU17): an explicit
   * department wins outright, then device coordinates (if the client sent
   * them), then the department name Gemini read from the free text, then
   * the user's saved preferred area, and finally the department with the
   * most active candidate activities — which never returns null, so this
   * method never does either.
   */
  private async resolveDepartment(
    input: {
      explicit: number | null;
      deviceLatitude: number | null;
      deviceLongitude: number | null;
      departmentName: string | null;
      candidateDepartments: { id: number; name: string }[];
      profile: UserPreferenceProfile | null;
    },
    resolvePoint: PointDepartmentResolver = (latitude, longitude) =>
      this.geographicResolution.nearestDepartment(latitude, longitude),
  ): Promise<number> {
    if (input.explicit !== null) {
      return input.explicit;
    }

    const byName = input.departmentName
      ? input.candidateDepartments.find(
          (department) => department.name === input.departmentName,
        )?.id
      : undefined;
    if (byName !== undefined) return byName;

    if (input.deviceLatitude != null && input.deviceLongitude != null) {
      const nearest = await resolvePoint(
        input.deviceLatitude,
        input.deviceLongitude,
      );
      if (nearest !== null) return nearest;
    }

    const profile = input.profile;
    if (
      profile?.preferredAreaLatitude != null &&
      profile?.preferredAreaLongitude != null
    ) {
      const nearest = await resolvePoint(
        profile.preferredAreaLatitude,
        profile.preferredAreaLongitude,
      );
      if (nearest !== null) return nearest;
    }

    const busiest =
      await this.geographicResolution.departmentWithMostActiveCandidates();
    if (busiest !== null) return busiest;

    // The catalog has no candidate activities at all — nothing downstream
    // can produce a plan either way; composeAndPersistPlans() will fail
    // with NO_VALID_COMBINATIONS, which is the correct terminal state for a
    // genuinely empty catalog rather than a missing-input problem.
    throw new PermanentJobError(
      JSON.stringify({ code: 'NO_VALID_COMBINATIONS' }),
    );
  }

  /**
   * Finds real candidate activities located in the request's resolved
   * department, optionally filtered by the request's resolved categories.
   * This is the candidate set composePlans() is constrained to pick from —
   * it never sees free text or invented places.
   */
  async findCandidateActivities(
    planRequest: PlanRequest,
  ): Promise<CandidateActivity[]> {
    const home = generationNow();
    const finish = (
      candidates: CandidateActivity[],
      matchedCandidateCount = candidates.length,
    ): CandidateActivity[] => {
      this.logger.log({
        event: 'candidate_query_completed',
        planRequestId: planRequest.id,
        mode: planRequest.mode,
        durationMs: generationNow() - home,
        candidateCount: candidates.length,
        poolCandidateCount: matchedCandidateCount,
        poolLimit: CANDIDATE_POOL_LIMIT,
        hasBudget: planRequest.budget !== null,
      });
      return candidates;
    };

    const requestedCategories = planRequest.resolvedOptions?.categoryIds
      ? planRequest.resolvedOptions.categoryIds.map((idCategory) => ({
          idCategory,
          statusKey: 'active',
        }))
      : await this.dataSource
          .getRepository(PlanRequestCategory)
          .createQueryBuilder('requestCategory')
          .innerJoin('requestCategory.category', 'category')
          .leftJoin('category.status', 'status')
          .where('requestCategory.id_plan_request = :planRequestId', {
            planRequestId: planRequest.id,
          })
          .select([
            'requestCategory.id_category AS "idCategory"',
            'status.key AS "statusKey"',
          ])
          .getRawMany<{ idCategory: number; statusKey: string | null }>();
    const categoryIds = requestedCategories
      .filter((category) => category.statusKey === 'active')
      .map((category) => category.idCategory);

    const explicitCategories =
      planRequest.resolvedOptions?.categorySource !== 'preferences';
    if (
      explicitCategories &&
      requestedCategories.length > 0 &&
      categoryIds.length === 0
    ) {
      return finish([]);
    }

    const timeOfDay = planRequest.resolvedOptions?.timeOfDay ?? null;
    const excludedCategoryIds =
      planRequest.resolvedOptions?.excludedCategoryIds ?? [];
    const partySize = planRequest.partySize ?? null;
    const costExpression = `activity.price_min * CASE WHEN activity.price_unit IN ('PER_PERSON','ENTRY','CONSUMPTION') OR (activity.price_unit = 'UNSPECIFIED' AND activity.cost_basis = 'per_person') THEN :costPeople ELSE 1 END`;
    const categoryScore = categoryIds.length
      ? `COALESCE((SELECT COUNT(*) FROM activity_category pref JOIN category pc ON pc.id = pref.id_category AND pc.deleted_at IS NULL JOIN category_status pcs ON pcs.id = pc.id_category_status AND pcs.deleted_at IS NULL AND pcs.key = 'active' WHERE pref.id_activity = activity.id AND pref.deleted_at IS NULL AND pref.id_category IN (:...preferenceCategoryIds)), 0)`
      : '0';
    const textScore = `ts_rank_cd(setweight(to_tsvector('spanish', activity.name), 'A') || setweight(to_tsvector('spanish', activity.description), 'B'), websearch_to_tsquery('spanish', :searchText))`;
    const feedbackScore = `COALESCE((SELECT AVG(fa.affinity) FROM search_affinity fa JOIN activity_category ac ON ac.id_category = fa.id_category AND ac.id_activity = activity.id AND ac.deleted_at IS NULL), 0)`;
    const ratingScore = `COALESCE((SELECT SUM(r.score)::float / (COUNT(*) + 5) FROM rating r WHERE r.id_activity = activity.id AND r.deleted_at IS NULL AND r.status = 'published'), MAX(CASE WHEN place.external_expires_at > now() THEN place.external_rating * LEAST(place.external_rating_count,100)::float / (LEAST(place.external_rating_count,100) + 5) END), 0)`;
    const distanceExpression =
      planRequest.resolvedLatitude != null &&
      planRequest.resolvedLongitude != null
        ? `6371 * acos(LEAST(1, GREATEST(-1, cos(radians(:latitude)) * cos(radians(activity_place.latitude)) * cos(radians(activity_place.longitude) - radians(:longitude)) + sin(radians(:latitude)) * sin(radians(activity_place.latitude)))))`
        : 'NULL::float';
    const locationOrder = `${distanceExpression} ASC NULLS LAST, activity_place.id`;

    const builder = this.dataSource
      .createQueryBuilder()
      .addCommonTableExpression(SEARCH_FEEDBACK_SQL, 'search_feedback', {
        materialized: true,
      })
      .addCommonTableExpression(SEARCH_AFFINITY_SQL, 'search_affinity', {
        materialized: true,
      })
      .addCommonTableExpression(SEARCH_SENSITIVITY_SQL, 'search_sensitivity', {
        materialized: true,
      })
      .select('activity.id', 'id')
      .addSelect('activity.name', 'name')
      .addSelect('activity.description', 'description')
      .addSelect(costExpression, 'estimatedCost')
      .addSelect('activity.price_kind', 'priceKind')
      .addSelect('activity.price_min', 'priceMin')
      .addSelect('activity.price_max', 'priceMax')
      .addSelect('activity.price_unit', 'priceUnit')
      .addSelect('activity.price_currency', 'priceCurrency')
      .addSelect('activity.price_source', 'priceSource')
      .addSelect('activity.price_source_ref', 'priceSourceRef')
      .addSelect('activity.price_verified_at', 'priceVerifiedAt')
      .addSelect(
        `ARRAY(SELECT DISTINCT c.name FROM activity_category ac JOIN category c ON c.id = ac.id_category AND c.deleted_at IS NULL JOIN category_status cs ON cs.id = c.id_category_status AND cs.deleted_at IS NULL AND cs.key = 'active' WHERE ac.id_activity = activity.id AND ac.deleted_at IS NULL ORDER BY c.name)`,
        'categoryNames',
      )
      .addSelect('activity.estimated_cost', 'unitEstimatedCost')
      .addSelect('activity.estimated_duration', 'estimatedDuration')
      .addSelect('activity.cost_basis', 'costBasis')
      .addSelect('activity.available_times_of_day', 'availableTimesOfDay')
      .addSelect('activity.min_people', 'minPeople')
      .addSelect('activity.max_people', 'maxPeople')
      .addSelect(`MIN(${distanceExpression})`, 'distanceKm')
      .addSelect(
        `${textScore} * 30 + ${categoryScore} * 2 + ${feedbackScore} + ${ratingScore} * 0.3 - COALESCE(MIN(${distanceExpression}), 0) * (0.05 + (SELECT distance_sensitivity FROM search_sensitivity) * 0.05) - (SELECT cost_sensitivity FROM search_sensitivity) * (${costExpression}) / :costReference * 0.4`,
        'relevanceScore',
      )
      .addSelect(
        `(array_agg(activity_place.latitude ORDER BY ${locationOrder}))[1]`,
        'latitude',
      )
      .addSelect(
        `(array_agg(activity_place.longitude ORDER BY ${locationOrder}))[1]`,
        'longitude',
      )
      .from('activity', 'activity')
      .innerJoin(
        'activity_place',
        'activity_place',
        'activity_place.id_activity = activity.id AND activity_place.deleted_at IS NULL',
      )
      .innerJoin(
        'place',
        'place',
        'place.id = activity_place.id_place AND place.deleted_at IS NULL',
      )
      .where('activity.deleted_at IS NULL')
      // Eligibility: published, discoverable and plannable. An activity with a
      // known, trusted price is preferred (see sampleRows); one whose price is
      // UNKNOWN may still be proposed so a young catalog never yields an empty
      // answer. It is never treated as free: totals report it as unpriced and
      // the budget guard only counts what is known.
      .andWhere("activity.status = 'published'")
      .andWhere('activity.discoverable = true')
      .andWhere('activity.plan_eligible = true')
      .andWhere(
        "(activity.auto_recommend_eligible = true OR activity.price_kind = 'UNKNOWN')",
      )
      .andWhere("place.status = 'published'")
      .andWhere('place.discoverable = true')
      .setParameters({
        costPeople: partySize ?? 1,
        costReference: Math.max(1, planRequest.budget ?? 5000),
        searchUser: planRequest.idUser,
        searchText: searchTerms(planRequest.rawQuery).join(' OR '),
        preferenceCategoryIds: categoryIds,
        latitude: planRequest.resolvedLatitude,
        longitude: planRequest.resolvedLongitude,
      });

    if (
      planRequest.resolvedOptions?.locationSource === 'explicit' ||
      !planRequest.resolvedOptions?.locationSource ||
      planRequest.resolvedLatitude == null ||
      planRequest.resolvedLongitude == null
    )
      builder.andWhere('place.id_department = :idDepartment', {
        idDepartment: planRequest.idDepartment,
      });
    builder.andWhere(
      `(${costExpression} IS NULL OR ${costExpression} <= 99999999.99)`,
    );

    if (timeOfDay)
      builder.andWhere(
        '(cardinality(activity.available_times_of_day) = 0 OR :timeOfDay = ANY(activity.available_times_of_day))',
        { timeOfDay },
      );
    if (excludedCategoryIds.length)
      builder.andWhere(
        'NOT EXISTS (SELECT 1 FROM activity_category excluded WHERE excluded.id_activity = activity.id AND excluded.deleted_at IS NULL AND excluded.id_category IN (:...excludedCategoryIds))',
        { excludedCategoryIds },
      );
    if (partySize !== null)
      builder.andWhere(
        '(activity.min_people IS NULL OR activity.min_people <= :partySize) AND (activity.max_people IS NULL OR activity.max_people >= :partySize)',
        { partySize },
      );
    if (planRequest.availableDuration != null)
      builder.andWhere('activity.estimated_duration <= :availableDuration', {
        availableDuration: planRequest.availableDuration,
      });

    if (
      planRequest.appliedMaxDistanceKm != null &&
      planRequest.resolvedLatitude != null &&
      planRequest.resolvedLongitude != null
    ) {
      const latitudeDelta = planRequest.appliedMaxDistanceKm / 110.574;
      const longitudeDelta = Math.min(
        180,
        planRequest.appliedMaxDistanceKm /
          (111.32 *
            Math.max(
              0.01,
              Math.cos((planRequest.resolvedLatitude * Math.PI) / 180),
            )),
      );
      builder.andWhere('activity_place.latitude BETWEEN :south AND :north', {
        south: planRequest.resolvedLatitude - latitudeDelta,
        north: planRequest.resolvedLatitude + latitudeDelta,
      });
      if (
        planRequest.resolvedLongitude - longitudeDelta >= -180 &&
        planRequest.resolvedLongitude + longitudeDelta <= 180
      )
        builder.andWhere('activity_place.longitude BETWEEN :west AND :east', {
          west: planRequest.resolvedLongitude - longitudeDelta,
          east: planRequest.resolvedLongitude + longitudeDelta,
        });
      builder.andWhere(
        'activity_place.latitude IS NOT NULL AND activity_place.longitude IS NOT NULL',
      );
      builder.andWhere(
        `6371 * acos(LEAST(1, GREATEST(-1,
        cos(radians(:latitude)) * cos(radians(activity_place.latitude)) *
        cos(radians(activity_place.longitude) - radians(:longitude)) +
        sin(radians(:latitude)) * sin(radians(activity_place.latitude))
      ))) <= :maxDistanceKm`,
        {
          latitude: planRequest.resolvedLatitude,
          longitude: planRequest.resolvedLongitude,
          maxDistanceKm: planRequest.appliedMaxDistanceKm,
        },
      );
    }

    if (planRequest.budget != null) {
      // An activity whose cost alone already exceeds the whole budget was
      // always going to fail composeAndPersistPlans()'s total-cost guard —
      // excluding it here is a pure win, not a behavior change to which
      // plans can ultimately be produced.
      builder.andWhere(
        `(${costExpression} IS NULL OR ${costExpression} <= :budget)`,
        { budget: planRequest.budget },
      );
    }

    if (explicitCategories && categoryIds.length > 0) {
      builder
        .innerJoin(
          'activity_category',
          'activity_category',
          'activity_category.id_activity = activity.id AND activity_category.deleted_at IS NULL',
        )
        .innerJoin(
          'category',
          'requested_category',
          'requested_category.id = activity_category.id_category AND requested_category.deleted_at IS NULL',
        )
        .innerJoin(
          'category_status',
          'requested_category_status',
          "requested_category_status.id = requested_category.id_category_status AND requested_category_status.deleted_at IS NULL AND requested_category_status.key = 'active'",
        )
        .andWhere('activity_category.id_category IN (:...categoryIds)', {
          categoryIds,
        });
    }

    const rows = await builder
      .groupBy('activity.id')
      .addGroupBy('activity.name')
      .addGroupBy('activity.description')
      .addGroupBy('activity.estimated_cost')
      .addGroupBy('activity.estimated_duration')
      .addGroupBy('activity.cost_basis')
      .addGroupBy('activity.available_times_of_day')
      .addGroupBy('activity.min_people')
      .addGroupBy('activity.max_people')
      .orderBy('"relevanceScore"', 'DESC')
      .addOrderBy('"estimatedCost"', 'ASC')
      .addOrderBy('activity.id', 'ASC')
      .limit(CANDIDATE_POOL_LIMIT)
      .getRawMany<
        PriceRow & {
          id: number;
          name: string;
          description: string;
          estimatedCost: string | null;
          categoryNames: string[];
          unitEstimatedCost: string;
          estimatedDuration: number;
          latitude: string | null;
          longitude: string | null;
          costBasis: CandidateActivity['costBasis'];
          availableTimesOfDay: TimeOfDay[];
          minPeople: number | null;
          maxPeople: number | null;
          distanceKm: string | null;
          relevanceScore: string;
        }
      >();

    if (rows.length === 0) return finish([]);

    return finish(
      shortlistCandidates(
        rows.map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description.replace(/<\/?b>/g, '').slice(0, 240),
          estimatedCost:
            row.estimatedCost === null ? null : Number(row.estimatedCost),
          price: priceFromRow(row),
          unitEstimatedCost: Number(row.unitEstimatedCost ?? row.estimatedCost),
          estimatedDuration: row.estimatedDuration,
          categoryNames: row.categoryNames ?? [],
          latitude: row.latitude === null ? null : Number(row.latitude),
          longitude: row.longitude === null ? null : Number(row.longitude),
          costBasis: row.costBasis,
          availableTimesOfDay: row.availableTimesOfDay ?? [],
          minPeople: row.minPeople,
          maxPeople: row.maxPeople,
          distanceKm: row.distanceKm == null ? null : Number(row.distanceKm),
          relevanceScore: Number(row.relevanceScore ?? 0),
        })),
        CANDIDATE_CAP,
      ),
      rows.length,
    );
  }

  /**
   * Composes plans from the candidate set via Gemini and persists them as
   * real Plan/PlanDetail rows. Follows the geographic/composition validation
   * policy (plan section 16): an alternative with no surviving activities is
   * discarded, not retried; NO_VALID_COMBINATIONS is permanent if none of
   * the composed alternatives survive.
   */
  async composeAndPersistPlans(planRequest: PlanRequest): Promise<void> {
    await this.startProgressStage(planRequest, 'searching');
    const candidates = await this.findCandidateActivities(planRequest);

    if (candidates.length === 0) {
      throw new PermanentJobError(
        JSON.stringify({ code: 'NO_VALID_COMBINATIONS' }),
      );
    }

    await this.startProgressStage(planRequest, 'composing');
    const compositionInput = {
      planRequestId: planRequest.id,
      rawQuery: planRequest.rawQuery,
      budget: planRequest.budget,
      availableDuration: planRequest.availableDuration,
      partySize: planRequest.partySize,
      candidates,
      timeOfDay: planRequest.resolvedOptions?.timeOfDay ?? null,
      travelMode: planRequest.resolvedOptions?.travelMode ?? 'drive',
    };
    const candidatesById = new Map(
      candidates.map((candidate) => [candidate.id, candidate]),
    );
    let validPlans: ComposedPlan[] = [];
    let compositionStrategy =
      candidates.length === 1 ? 'single_activity' : 'gemini';
    let modelAttempts = 0;
    let fallbackReason = 'budget_exhausted';
    const compositionStartedAt = generationNow();
    // Both attempts share one budget. A normal model response gets the full
    // window; only an early failure or invalid result gets a recovery attempt.
    while (candidates.length > 1 && modelAttempts < 2 && !validPlans.length) {
      const timeoutMs = Math.min(
        COMPOSITION_BUDGET_MS - (generationNow() - compositionStartedAt),
        remainingGenerationMs(planRequest.requestedAt) - PERSISTENCE_RESERVE_MS,
      );
      if (timeoutMs < MIN_MODEL_ATTEMPT_MS) break;
      modelAttempts++;
      try {
        const composedPlans = await this.gemini.composePlans({
          ...compositionInput,
          timeoutMs,
          retryInvalidResult:
            modelAttempts > 1 && fallbackReason === 'invalid_result',
        });
        validPlans = composedPlans.filter((plan) =>
          this.isComposedPlanWithinLimits(plan, planRequest, candidatesById),
        );
        fallbackReason = 'invalid_result';
      } catch (error) {
        if (error instanceof GenerationTimeoutError) throw error;
        fallbackReason =
          error instanceof PermanentJobError
            ? 'provider_rejected'
            : 'provider_failed';
        this.logger.warn({
          event: 'composition_attempt_failed',
          planRequestId: planRequest.id,
          attempt: modelAttempts,
          errorClass:
            error instanceof Error ? error.constructor.name : 'unknown',
        });
        if (error instanceof PermanentJobError) break;
      }
    }

    if (validPlans.length === 0) {
      // Last resort: offer individual activities, never invent a coherent
      // multi-stop outing by greedily packing unrelated meals or experiences.
      validPlans = candidates.flatMap((candidate) =>
        deterministicPlans(
          [candidate],
          planRequest.budget,
          planRequest.availableDuration,
          planRequest.resolvedOptions?.travelMode ?? 'drive',
        ),
      );
      if (candidates.length > 1) {
        compositionStrategy = 'local_fallback';
        this.logger.warn({
          event: 'composition_local_fallback',
          planRequestId: planRequest.id,
          reason: fallbackReason,
          modelAttempts,
        });
      }
    }
    const signatures = new Set<string>();
    validPlans = validPlans
      .filter((plan) => {
        const signature = plan.activities
          .map(({ activityId }) => activityId)
          .sort((a, b) => a - b)
          .join(',');
        if (signatures.has(signature)) return false;
        signatures.add(signature);
        return true;
      })
      .slice(0, 6);

    if (validPlans.length === 0) {
      throw new PermanentJobError(
        JSON.stringify({ code: 'NO_VALID_COMBINATIONS' }),
      );
    }

    await this.startProgressStage(planRequest, 'routing');
    const mapsHome = generationNow();
    let routeByPlan = await this.calculateOptionalRoutes(
      validPlans,
      candidatesById,
      planRequest.requestedAt,
      planRequest.resolvedOptions?.travelMode ?? 'drive',
    );
    const routed = validPlans
      .map((plan, index) => ({ plan, route: routeByPlan[index] }))
      .filter(
        ({ plan, route }) =>
          planRequest.availableDuration == null ||
          plan.activities.reduce(
            (sum, { activityId }) =>
              sum + (candidatesById.get(activityId)?.estimatedDuration ?? 0),
            0,
          ) +
            (route
              ? Math.ceil(route.durationSeconds / 60)
              : estimatedTravelMinutes(
                  plan.activities.map(
                    ({ activityId }) => candidatesById.get(activityId)!,
                  ),
                  planRequest.resolvedOptions?.travelMode ?? 'drive',
                )) <=
            planRequest.availableDuration,
      );
    validPlans = routed.map(({ plan }) => plan);
    routeByPlan = routed.map(({ route }) => route);
    if (!validPlans.length) {
      compositionStrategy = 'route_fallback';
      this.logger.warn({
        event: 'composition_route_fallback',
        planRequestId: planRequest.id,
        reason: 'travel_duration_exceeded',
      });
      validPlans = candidates
        .slice(0, 6)
        .filter(
          (candidate) =>
            (planRequest.budget == null ||
              candidate.estimatedCost === null ||
              candidate.estimatedCost <= planRequest.budget) &&
            (planRequest.availableDuration == null ||
              candidate.estimatedDuration <= planRequest.availableDuration),
        )
        .map(
          (candidate) =>
            deterministicPlans(
              [candidate],
              planRequest.budget,
              planRequest.availableDuration,
            )[0],
        );
      routeByPlan = validPlans.map(() => null);
    }
    if (!validPlans.length)
      throw new PermanentJobError(
        JSON.stringify({ code: 'NO_VALID_COMBINATIONS' }),
      );
    this.logger.log({
      event: 'composition_strategy',
      planRequestId: planRequest.id,
      strategy: compositionStrategy,
      modelAttempts,
      candidateCount: candidates.length,
      planCount: validPlans.length,
    });
    this.logger.log({
      event: 'maps_routes_completed',
      planRequestId: planRequest.id,
      durationMs: generationNow() - mapsHome,
      planCount: validPlans.length,
    });

    await this.startProgressStage(planRequest, 'finalizing');
    const persistenceStartedAt = generationNow();
    await this.dataSource.transaction(async (manager) => {
      await this.lockActiveRequest(manager, planRequest);
      const generatedRequestStatusId = await this.statusIdByKey(
        manager.getRepository(PlanRequest),
        'generated',
      );
      const generatedPlanStatusId = await this.planStatusIdByKey(
        manager,
        'generated',
      );

      for (const [index, composedPlan] of validPlans.entries()) {
        const totals = computePlanTotals(
          composedPlan.activities.flatMap((activity) => {
            const candidate = candidatesById.get(activity.activityId);
            return candidate ? [candidate.price] : [];
          }),
          planRequest.partySize ?? 1,
        );
        const totalDuration = composedPlan.activities.reduce(
          (sum, activity) =>
            sum +
            (candidatesById.get(activity.activityId)?.estimatedDuration ?? 0),
          0,
        );
        const route = routeByPlan[index];
        const plan = await manager.save(
          manager.create(Plan, {
            title: composedPlan.title,
            description: composedPlan.description,
            idUser: planRequest.idUser,
            // A result of the request, private to the requester: never in
            // "Mis planes" and never published (#98).
            kind: PlanKind.Generated,
            idPlanRequest: planRequest.id,
            idPlanStatus: generatedPlanStatusId,
            peopleCount: planRequest.partySize ?? 1,
            estimatedTotalCost: totals.totalMin,
            estimatedTotalCostMax: totals.totalMax,
            unpricedCount: totals.unpricedCount,
            priceCompleteness: totals.completeness,
            estimatedTotalDuration:
              totalDuration +
              (route
                ? Math.ceil(route.durationSeconds / 60)
                : estimatedTravelMinutes(
                    composedPlan.activities.map(
                      ({ activityId }) => candidatesById.get(activityId)!,
                    ),
                    planRequest.resolvedOptions?.travelMode ?? 'drive',
                  )),

            travelDistanceMeters: route?.distanceMeters ?? null,
            travelDurationSeconds: route?.durationSeconds ?? null,
          }),
        );

        await manager.save(
          composedPlan.activities.map((activity) => {
            const candidate = candidatesById.get(activity.activityId);
            return manager.create(PlanDetail, {
              idPlan: plan.id,
              idActivity: activity.activityId,
              order: activity.order,
              // Immutable snapshot of what the candidate list showed.
              ...snapshotValues(candidate?.price ?? UNKNOWN_PRICE),
              estimatedDuration: candidate?.estimatedDuration ?? 0,
            });
          }),
        );
      }

      assertGenerationTime(planRequest.requestedAt);
      await manager.update(PlanRequest, planRequest.id, {
        idRequestStatus: generatedRequestStatusId,
      });
    });

    const completedAt = generationNow();
    this.logger.log({
      event: 'plan_generation_stage_completed',
      planRequestId: planRequest.id,
      stage: 'finalizing',
      durationMs: completedAt - persistenceStartedAt,
    });
    this.logger.log({
      event: 'plan_generation_completed',
      planRequestId: planRequest.id,
      mode: planRequest.mode,
      durationMs: completedAt - planRequest.requestedAt.getTime(),
      candidateCount: candidates.length,
      planCount: validPlans.length,
    });
  }

  private async startProgressStage(
    planRequest: PlanRequest,
    stage: PlanRequestProgressStage,
  ): Promise<void> {
    assertGenerationTime(planRequest.requestedAt);
    const startedAt = new Date(generationNow());
    if (planRequest.progressStage && planRequest.progressStageAt) {
      this.logger.log({
        event: 'plan_generation_stage_completed',
        planRequestId: planRequest.id,
        stage: planRequest.progressStage,
        durationMs: startedAt.getTime() - planRequest.progressStageAt.getTime(),
      });
    }

    const updated = await this.planRequests
      .createQueryBuilder()
      .update(PlanRequest)
      .set({ progressStage: stage, progressStageAt: startedAt })
      .where('id = :id', { id: planRequest.id })
      .andWhere(
        "id_request_status IN (SELECT id FROM request_status WHERE key IN ('pending', 'processing'))",
      )
      .andWhere(
        "requested_at > clock_timestamp() - (:generationTimeoutMs * interval '1 millisecond')",
        { generationTimeoutMs: GENERATION_TIMEOUT_MS },
      )
      .execute();
    if (updated.affected === 0) throw new GenerationTimeoutError();
    planRequest.progressStage = stage;
    planRequest.progressStageAt = startedAt;

    this.logger.log({
      event: 'plan_generation_stage_started',
      planRequestId: planRequest.id,
      mode: planRequest.mode,
      stage,
    });
  }

  /**
   * Refines a composed plan's total travel distance/duration through a
   * single computeRoutes call over its activities' real coordinates, in
   * composed order (plan section 15). Best-effort: an alternative missing
   * coordinates, or a failed Maps call, simply persists without travel
   * data rather than blocking generation (no IA<->Maps retry loop, section
   * 16 policy).
   */
  private async calculateOptionalRoutes(
    plans: ComposedPlan[],
    candidatesById: Map<number, CandidateActivity>,
    requestedAt: Date,
    travelMode: TravelMode = 'drive',
  ): Promise<({ distanceMeters: number; durationSeconds: number } | null)[]> {
    const budgetMs = Math.min(
      OPTIONAL_ROUTING_TIMEOUT_MS,
      remainingGenerationMs(requestedAt) - PERSISTENCE_RESERVE_MS,
    );
    if (budgetMs <= 0) return plans.map(() => null);

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const expired = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(null);
      }, budgetMs);
    });
    try {
      const routes = new Map<
        string,
        Promise<{ distanceMeters: number; durationSeconds: number } | null>
      >();
      const routeFor = (plan: ComposedPlan) => {
        const key =
          `${travelMode}:` +
          plan.activities
            .map(({ activityId }) => candidatesById.get(activityId))
            .filter(
              (candidate) =>
                candidate?.latitude != null && candidate.longitude != null,
            )
            .map(
              (candidate) => `${candidate!.latitude},${candidate!.longitude}`,
            )
            .join(';');
        if (!routes.has(key))
          routes.set(
            key,
            this.calculateComposedPlanRoute(
              plan,
              candidatesById,
              controller.signal,
              travelMode,
            ),
          );
        return routes.get(key)!;
      };
      // Race each route separately to keep completed routes even if another hangs.
      return await Promise.all(
        plans.map((plan) => Promise.race([routeFor(plan), expired])),
      );
    } finally {
      clearTimeout(timer!);
      controller.abort();
    }
  }

  private async calculateComposedPlanRoute(
    composedPlan: { activities: { activityId: number; order: number }[] },
    candidatesById: Map<
      number,
      { latitude: number | null; longitude: number | null }
    >,
    signal: AbortSignal,
    travelMode: TravelMode = 'drive',
  ): Promise<{ distanceMeters: number; durationSeconds: number } | null> {
    const waypoints = composedPlan.activities
      .map((activity) => candidatesById.get(activity.activityId))
      .filter(
        (candidate): candidate is { latitude: number; longitude: number } =>
          candidate?.latitude != null && candidate.longitude != null,
      );

    if (waypoints.length < 2) return null;

    try {
      return await this.googleMaps.calculateRoute(
        waypoints,
        signal,
        travelMode,
      );
    } catch (error) {
      this.logger.warn(
        `Could not refine travel route for a composed plan: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  /**
   * Server-side guard for a single composed alternative: reject a repeated
   * activity, and reject a combination whose resolved cost or duration
   * exceeds the request's budget / available time when those are set.
   */
  private isComposedPlanWithinLimits(
    composedPlan: { activities: { activityId: number }[] },
    planRequest: PlanRequest,
    candidatesById: Map<number, CandidateActivity>,
  ): boolean {
    const activityIds = composedPlan.activities.map(
      (activity) => activity.activityId,
    );

    if (
      !activityIds.length ||
      activityIds.some(
        (id) =>
          !candidatesById.has(id) ||
          !matchesActivityConstraints(
            candidatesById.get(id)!,
            planRequest.resolvedOptions?.timeOfDay ?? null,
            planRequest.partySize,
          ),
      )
    )
      return false;

    if (new Set(activityIds).size !== activityIds.length) {
      return false;
    }

    const totals = computePlanTotals(
      activityIds.flatMap((id) => {
        const candidate = candidatesById.get(id);
        return candidate ? [candidate.price] : [];
      }),
      planRequest.partySize ?? 1,
    );
    // The worst case we can state: the upper bound when there is one, else the
    // known lower bound (an open-ended "from" price cannot be capped).
    const totalCost = totals.totalMax ?? totals.totalMin ?? 0;
    const totalDuration = activityIds.reduce(
      (sum, id) => sum + (candidatesById.get(id)?.estimatedDuration ?? 0),
      0,
    );

    if (
      !Number.isFinite(totalCost) ||
      totalCost > Math.min(planRequest.budget ?? 99999999.99, 99999999.99)
    ) {
      return false;
    }
    if (
      planRequest.availableDuration != null &&
      totalDuration +
        estimatedTravelMinutes(
          activityIds.map((id) => candidatesById.get(id)!),
          planRequest.resolvedOptions?.travelMode ?? 'drive',
        ) >
        planRequest.availableDuration
    ) {
      return false;
    }

    return true;
  }

  private async persistResolvedIntent(
    planRequest: PlanRequest,
    resolved: {
      budget: number | null;
      idDepartment: number | null;
      idOutingType: number | null;
      availableDuration: number | null;
      partySize: number | null;
      categoryIds: number[];
      resolvedLatitude?: number | null;
      resolvedLongitude?: number | null;
      appliedMaxDistanceKm?: number | null;
      resolvedOptions?: ResolvedSearchOptions;
    },
  ): Promise<PlanRequest> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockActiveRequest(manager, planRequest);
      await manager.update(PlanRequest, planRequest.id, {
        budget: resolved.budget,
        idDepartment: resolved.idDepartment,
        idOutingType: resolved.idOutingType,
        availableDuration: resolved.availableDuration,
        partySize: resolved.partySize,
        resolvedLatitude: resolved.resolvedLatitude ?? null,
        resolvedLongitude: resolved.resolvedLongitude ?? null,
        appliedMaxDistanceKm: resolved.appliedMaxDistanceKm ?? null,
        resolvedOptions: resolved.resolvedOptions
          ? { ...resolved.resolvedOptions, categoryIds: resolved.categoryIds }
          : null,
        intentResolvedAt: new Date(generationNow()),
      });

      if (resolved.categoryIds.length > 0) {
        const categoryRepository = manager.getRepository(PlanRequestCategory);
        await categoryRepository.save(
          resolved.categoryIds.map((idCategory) =>
            categoryRepository.create({
              idPlanRequest: planRequest.id,
              idCategory,
            }),
          ),
        );
      }

      const updated = await manager.findOneOrFail(PlanRequest, {
        where: { id: planRequest.id },
      });
      return updated;
    });
  }

  private async lockActiveRequest(
    manager: DataSource['manager'],
    request: PlanRequest,
  ): Promise<void> {
    assertGenerationTime(request.requestedAt);
    // Bound lock waits and SQL execution by the same request deadline.
    await manager.query(
      "SELECT set_config('statement_timeout', $1, true), set_config('lock_timeout', $1, true)",
      [String(remainingGenerationMs(request.requestedAt))],
    );
    const current = await manager
      .createQueryBuilder(PlanRequest, 'request')
      .innerJoinAndSelect('request.status', 'status')
      .setLock('pessimistic_write')
      .where('request.id = :id', { id: request.id })
      .getOne();
    assertGenerationTime(request.requestedAt);
    if (!current || !['pending', 'processing'].includes(current.status.key)) {
      throw new PermanentJobError(
        JSON.stringify({ code: 'GENERATION_ALREADY_FINISHED' }),
      );
    }
  }

  private async statusIdByKey(
    repository: Repository<PlanRequest>,
    key: string,
  ): Promise<number> {
    const status = await repository.manager
      .createQueryBuilder()
      .select('status.id', 'id')
      .from('request_status', 'status')
      .where('status.key = :key', { key })
      .getRawOne<{ id: number }>();

    if (!status) {
      this.logger.error(`Missing request_status seed value "${key}"`);
      throw new Error(
        `Missing request_status seed value "${key}". Run pnpm db:seed.`,
      );
    }

    return status.id;
  }

  private async planStatusIdByKey(
    manager: DataSource['manager'],
    key: string,
  ): Promise<number> {
    const status = await manager
      .createQueryBuilder()
      .select('status.id', 'id')
      .from('plan_status', 'status')
      .where('status.key = :key', { key })
      .getRawOne<{ id: number }>();

    if (!status) {
      this.logger.error(`Missing plan_status seed value "${key}"`);
      throw new Error(
        `Missing plan_status seed value "${key}". Run pnpm db:seed.`,
      );
    }

    return status.id;
  }
}
