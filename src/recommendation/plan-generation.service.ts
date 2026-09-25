import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Category } from '../categories/entities/category.entity';
import { Department } from '../places/entities/department.entity';
import { Plan } from '../plans/entities/plan.entity';
import { PlanDetail } from '../plans/entities/plan-detail.entity';
import { PermanentJobError } from '../messaging/errors/permanent-job-error';
import { GoogleMapsClientService } from '../external-integration/google-maps/google-maps-client.service';
import { CandidateActivity } from './dto/candidate-activity.dto';
import { GeminiClientService } from './gemini/gemini-client.service';
import { GeographicResolutionService } from './geographic-resolution.service';
import {
  PlanRequest,
  PlanRequestMode,
  PlanRequestProgressStage,
} from './entities/plan-request.entity';
import { PlanRequestCategory } from './entities/plan-request-category.entity';
import { UserPreference } from '../users/entities/user-preference.entity';
import { UserPreferenceProfile } from '../users/entities/user-preference-profile.entity';
import { UserPreferenceProfileLookupService } from '../users/user-preference-profile-lookup.service';

export type ClaimResult = 'claimed' | 'terminal' | 'skip';

const MIN_CANDIDATES_REQUIRED = 2;

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
const CANDIDATE_CAP = 40;

/**
 * How long a request may sit in `processing` before its slot is considered
 * abandoned (worker crashed or hung before persisting any Plan). Shared with
 * PlanRequestRecoveryScheduler: the sweep republishes a request once it is
 * this stale, and claim() must treat the same threshold as re-claimable or
 * the redelivered message would just be skipped forever.
 */
export const STALE_PROCESSING_MINUTES = 15;
const STALE_PROCESSING_MS = STALE_PROCESSING_MINUTES * 60 * 1000;

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
        // Another attempt owns this request, unless its processing slot is
        // stale (crash/hang with no plans persisted). The recovery sweep
        // republishes stale `processing` requests; re-claim atomically here
        // so the redelivered message actually regenerates instead of being
        // skipped and eventually failed by the sweep.
        const startedAt = request.processingStartedAt;
        const isStale =
          startedAt != null &&
          startedAt.getTime() < Date.now() - STALE_PROCESSING_MS;
        if (!isRetryAttempt && !isStale) {
          return 'skip';
        }

        if (request.progressStage && request.progressStageAt) {
          this.logger.warn({
            event: 'plan_generation_stage_interrupted',
            planRequestId,
            stage: request.progressStage,
            elapsedMs: Date.now() - request.progressStageAt.getTime(),
          });
        }
      }

      const processingStatusId = await this.statusIdByKey(
        manager.getRepository(PlanRequest),
        'processing',
      );

      await manager.update(PlanRequest, planRequestId, {
        idRequestStatus: processingStatusId,
        processingStartedAt: new Date(),
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
    await this.planRequests.update(planRequestId, {
      idRequestStatus: generatedStatusId,
    });
    return true;
  }

  /**
   * Interprets the request's raw query and context into normalized fields,
   * persisting them atomically together with `intentResolvedAt` so a retry
   * never repeats this call (checkpoint, plan section 4.6/6).
   *
   * Nothing here is allowed to leave the request unable to generate: budget
   * and location both fall through explicit context -> Gemini's read of the
   * free text -> the user's stored `UserPreferenceProfile` -> a system
   * default (unconstrained budget, busiest department for location). A
   * missing input is never a reason to fail the request — that would defeat
   * the point of a free-text composer (CU17).
   */
  async resolveIntent(planRequest: PlanRequest): Promise<PlanRequest> {
    if (planRequest.intentResolvedAt !== null) {
      return planRequest;
    }

    if (planRequest.mode === PlanRequestMode.Surprise) {
      await this.startProgressStage(planRequest, 'locating');
    } else {
      await this.startProgressStage(planRequest, 'interpreting');
    }

    const [
      { departments: candidateDepartments, categories: candidateCategories },
      profile,
    ] = await Promise.all([
      this.departmentAndCategoryCatalog(),
      this.preferenceProfiles.findByUser(planRequest.idUser),
    ]);

    if (planRequest.mode === PlanRequestMode.Surprise) {
      const preferredCategoryIds = (
        await this.dataSource
          .getRepository(UserPreference)
          .createQueryBuilder('preference')
          .innerJoin('preference.category', 'category')
          .innerJoin('category.status', 'status')
          .where('preference.id_user = :idUser', {
            idUser: planRequest.idUser,
          })
          .andWhere('status.key = :activeStatus', { activeStatus: 'active' })
          .select('preference.id_category', 'idCategory')
          .getRawMany<{ idCategory: number }>()
      ).map((preference) => preference.idCategory);

      // createSurprise() already tried device coordinates, then the
      // profile's preferred area; if both were unavailable it persisted
      // idDepartment as null, and the busiest-department default below
      // closes that last gap here.
      const idDepartment =
        planRequest.idDepartment ??
        (await this.geographicResolution.departmentWithMostActiveCandidates());

      return this.persistResolvedIntent(planRequest, {
        budget: profile?.usualBudget ?? null,
        idDepartment,
        idOutingType: null,
        availableDuration: null,
        partySize: profile?.usualPeopleCount ?? null,
        categoryIds: preferredCategoryIds,
      });
    }

    const context = (planRequest.rawContext ?? {}) as {
      budget?: number;
      idDepartment?: number;
      partySize?: number;
      availableDuration?: number;
      latitude?: number;
      longitude?: number;
    };

    const contextDepartmentName = context.idDepartment
      ? candidateDepartments.find((d) => d.id === context.idDepartment)?.name
      : undefined;

    const interpreted = await this.gemini.interpretIntent({
      planRequestId: planRequest.id,
      rawQuery: planRequest.rawQuery ?? '',
      context: {
        budget: context.budget,
        departmentName: contextDepartmentName,
        partySize: context.partySize,
        availableDuration: context.availableDuration,
      },
      candidateDepartments: candidateDepartments.map((d) => ({
        id: d.id,
        name: d.name,
      })),
      candidateCategories: candidateCategories.map((c) => ({
        id: c.id,
        name: c.name,
      })),
    });

    await this.startProgressStage(planRequest, 'locating');
    const resolvedDepartment = await this.resolveDepartment({
      explicit: context.idDepartment ?? null,
      deviceLatitude: context.latitude ?? null,
      deviceLongitude: context.longitude ?? null,
      departmentName: interpreted.departmentName,
      candidateDepartments,
      profile,
    });

    const resolvedCategoryIds = candidateCategories
      .filter((category) => interpreted.categoryNames.includes(category.name))
      .map((category) => category.id);

    return this.persistResolvedIntent(planRequest, {
      budget: interpreted.budget ?? profile?.usualBudget ?? null,
      idDepartment: resolvedDepartment,
      idOutingType: null,
      availableDuration: interpreted.availableDuration,
      partySize: interpreted.partySize ?? profile?.usualPeopleCount ?? null,
      categoryIds: resolvedCategoryIds,
    });
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
    if (cached && cached.expiresAt > Date.now()) {
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
      expiresAt: Date.now() + CATALOG_CACHE_TTL_MS,
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
  private async resolveDepartment(input: {
    explicit: number | null;
    deviceLatitude: number | null;
    deviceLongitude: number | null;
    departmentName: string | null;
    candidateDepartments: { id: number; name: string }[];
    profile: UserPreferenceProfile | null;
  }): Promise<number> {
    if (input.explicit !== null) {
      return input.explicit;
    }

    if (input.deviceLatitude != null && input.deviceLongitude != null) {
      const nearest = await this.geographicResolution.nearestDepartment(
        input.deviceLatitude,
        input.deviceLongitude,
      );
      if (nearest !== null) return nearest;
    }

    const byName = input.departmentName
      ? input.candidateDepartments.find(
          (department) => department.name === input.departmentName,
        )?.id
      : undefined;
    if (byName !== undefined) return byName;

    const profile = input.profile;
    if (
      profile?.preferredAreaLatitude != null &&
      profile?.preferredAreaLongitude != null
    ) {
      const nearest = await this.geographicResolution.nearestDepartment(
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
    const home = Date.now();
    const finish = (
      candidates: CandidateActivity[],
      matchedCandidateCount = candidates.length,
    ): CandidateActivity[] => {
      this.logger.log({
        event: 'candidate_query_completed',
        planRequestId: planRequest.id,
        mode: planRequest.mode,
        durationMs: Date.now() - home,
        candidateCount: candidates.length,
        matchedCandidateCount,
        hasBudget: planRequest.budget !== null,
      });
      return candidates;
    };

    const requestedCategories = await this.dataSource
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

    if (requestedCategories.length > 0 && categoryIds.length === 0) {
      return finish([]);
    }

    const builder = this.dataSource
      .createQueryBuilder()
      .select('activity.id', 'id')
      .addSelect('activity.name', 'name')
      .addSelect('activity.description', 'description')
      .addSelect('activity.estimated_cost', 'estimatedCost')
      .addSelect('activity.estimated_duration', 'estimatedDuration')
      .addSelect('MIN(activity_place.latitude)', 'latitude')
      .addSelect('MIN(activity_place.longitude)', 'longitude')
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
      .andWhere('place.id_department = :idDepartment', {
        idDepartment: planRequest.idDepartment,
      });

    if (planRequest.budget !== null) {
      // An activity whose cost alone already exceeds the whole budget was
      // always going to fail composeAndPersistPlans()'s total-cost guard —
      // excluding it here is a pure win, not a behavior change to which
      // plans can ultimately be produced.
      builder.andWhere('activity.estimated_cost <= :budget', {
        budget: planRequest.budget,
      });
    }

    if (categoryIds.length > 0) {
      builder
        .innerJoin(
          'activity_category',
          'activity_category',
          'activity_category.id_activity = activity.id AND activity_category.deleted_at IS NULL',
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
      .getRawMany<{
        id: number;
        name: string;
        description: string;
        estimatedCost: string;
        estimatedDuration: number;
        latitude: string | null;
        longitude: string | null;
      }>();

    if (rows.length === 0) return finish([]);

    // Capping before the category lookup also saves that query's cost for
    // whatever gets discarded, not just the Gemini prompt's.
    const sampledRows = sampleRows(rows, CANDIDATE_CAP);

    const categoryNamesByActivity = await this.categoryNamesByActivity(
      sampledRows.map((row) => row.id),
    );

    return finish(
      sampledRows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        estimatedCost: Number(row.estimatedCost),
        estimatedDuration: row.estimatedDuration,
        categoryNames: categoryNamesByActivity.get(row.id) ?? [],
        latitude: row.latitude === null ? null : Number(row.latitude),
        longitude: row.longitude === null ? null : Number(row.longitude),
      })),
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

    if (candidates.length < MIN_CANDIDATES_REQUIRED) {
      throw new PermanentJobError(
        JSON.stringify({ code: 'NO_VALID_COMBINATIONS' }),
      );
    }

    await this.startProgressStage(planRequest, 'composing');
    const composedPlans = await this.gemini.composePlans({
      planRequestId: planRequest.id,
      rawQuery: planRequest.rawQuery,
      budget: planRequest.budget,
      availableDuration: planRequest.availableDuration,
      partySize: planRequest.partySize,
      candidates,
    });

    if (composedPlans.length === 0) {
      throw new PermanentJobError(
        JSON.stringify({ code: 'NO_VALID_COMBINATIONS' }),
      );
    }

    const candidatesById = new Map(
      candidates.map((candidate) => [candidate.id, candidate]),
    );

    // The Gemini prompt is not a business validation: parseComposedPlans()
    // only drops non-existent ids. Enforce the resolved limits here — no
    // repeated activity within an alternative, and total cost/duration within
    // the request's budget and available time (when set). Alternatives that
    // break a limit are discarded; if none survive the request fails with
    // NO_VALID_COMBINATIONS rather than persisting an invalid plan.
    const validPlans = composedPlans.filter((composedPlan) =>
      this.isComposedPlanWithinLimits(
        composedPlan,
        planRequest,
        candidatesById,
      ),
    );

    if (validPlans.length === 0) {
      throw new PermanentJobError(
        JSON.stringify({ code: 'NO_VALID_COMBINATIONS' }),
      );
    }

    await this.startProgressStage(planRequest, 'routing');
    const mapsHome = Date.now();
    const routeByPlan = await Promise.all(
      validPlans.map((composedPlan) =>
        this.calculateComposedPlanRoute(composedPlan, candidatesById),
      ),
    );
    this.logger.log({
      event: 'maps_routes_completed',
      planRequestId: planRequest.id,
      durationMs: Date.now() - mapsHome,
      planCount: validPlans.length,
    });

    await this.startProgressStage(planRequest, 'finalizing');
    const persistenceStartedAt = Date.now();
    await this.dataSource.transaction(async (manager) => {
      const generatedRequestStatusId = await this.statusIdByKey(
        manager.getRepository(PlanRequest),
        'generated',
      );
      const generatedPlanStatusId = await this.planStatusIdByKey(
        manager,
        'generated',
      );

      for (const [index, composedPlan] of validPlans.entries()) {
        const totalCost = composedPlan.activities.reduce(
          (sum, activity) =>
            sum + (candidatesById.get(activity.activityId)?.estimatedCost ?? 0),
          0,
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
            idPlanRequest: planRequest.id,
            idPlanStatus: generatedPlanStatusId,
            estimatedTotalCost: totalCost,
            estimatedTotalDuration: totalDuration,
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
              estimatedCost: candidate?.estimatedCost ?? 0,
              estimatedDuration: candidate?.estimatedDuration ?? 0,
            });
          }),
        );
      }

      await manager.update(PlanRequest, planRequest.id, {
        idRequestStatus: generatedRequestStatusId,
      });
    });

    const completedAt = Date.now();
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
    const startedAt = new Date();
    if (planRequest.progressStage && planRequest.progressStageAt) {
      this.logger.log({
        event: 'plan_generation_stage_completed',
        planRequestId: planRequest.id,
        stage: planRequest.progressStage,
        durationMs: startedAt.getTime() - planRequest.progressStageAt.getTime(),
      });
    }

    await this.planRequests.update(planRequest.id, {
      progressStage: stage,
      progressStageAt: startedAt,
    });
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
  private async calculateComposedPlanRoute(
    composedPlan: { activities: { activityId: number; order: number }[] },
    candidatesById: Map<
      number,
      { latitude: number | null; longitude: number | null }
    >,
  ): Promise<{ distanceMeters: number; durationSeconds: number } | null> {
    const waypoints = composedPlan.activities
      .map((activity) => candidatesById.get(activity.activityId))
      .filter(
        (candidate): candidate is { latitude: number; longitude: number } =>
          candidate?.latitude != null && candidate.longitude != null,
      );

    if (waypoints.length < 2) return null;

    try {
      return await this.googleMaps.calculateRoute(waypoints);
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
    candidatesById: Map<
      number,
      { estimatedCost: number; estimatedDuration: number }
    >,
  ): boolean {
    const activityIds = composedPlan.activities.map(
      (activity) => activity.activityId,
    );

    if (new Set(activityIds).size !== activityIds.length) {
      return false;
    }

    const totalCost = activityIds.reduce(
      (sum, id) => sum + (candidatesById.get(id)?.estimatedCost ?? 0),
      0,
    );
    const totalDuration = activityIds.reduce(
      (sum, id) => sum + (candidatesById.get(id)?.estimatedDuration ?? 0),
      0,
    );

    if (planRequest.budget !== null && totalCost > planRequest.budget) {
      return false;
    }
    if (
      planRequest.availableDuration !== null &&
      totalDuration > planRequest.availableDuration
    ) {
      return false;
    }

    return true;
  }

  private async categoryNamesByActivity(
    activityIds: number[],
  ): Promise<Map<number, string[]>> {
    const rows = await this.dataSource
      .createQueryBuilder()
      .select('activity_category.id_activity', 'idActivity')
      .addSelect('category.name', 'categoryName')
      .from('activity_category', 'activity_category')
      .innerJoin(
        'category',
        'category',
        'category.id = activity_category.id_category',
      )
      .innerJoin(
        'category_status',
        'category_status',
        "category_status.id = category.id_category_status AND category_status.key = 'active' AND category_status.deleted_at IS NULL",
      )
      .where('activity_category.id_activity IN (:...activityIds)', {
        activityIds,
      })
      .andWhere('activity_category.deleted_at IS NULL')
      .getRawMany<{ idActivity: number; categoryName: string }>();

    const map = new Map<number, string[]>();
    for (const row of rows) {
      const names = map.get(row.idActivity) ?? [];
      names.push(row.categoryName);
      map.set(row.idActivity, names);
    }
    return map;
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
    },
  ): Promise<PlanRequest> {
    return this.dataSource.transaction(async (manager) => {
      await manager.update(PlanRequest, planRequest.id, {
        budget: resolved.budget,
        idDepartment: resolved.idDepartment,
        idOutingType: resolved.idOutingType,
        availableDuration: resolved.availableDuration,
        partySize: resolved.partySize,
        intentResolvedAt: new Date(),
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

/**
 * A bounded, unbiased random sample (Fisher-Yates) of at most `cap` rows.
 * Cheap — no extra join, no `ORDER BY` computation — which is the point:
 * a "top by rating" cap would need a `Rating`/`moderationStatus`-aware join
 * this change doesn't want to take on yet. Returns `rows` itself, not a
 * copy, when it's already within the cap.
 */
function sampleRows<T>(rows: T[], cap: number): T[] {
  if (rows.length <= cap) return rows;

  const pool = [...rows];
  for (let i = pool.length - 1; i > pool.length - 1 - cap; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(pool.length - cap);
}
