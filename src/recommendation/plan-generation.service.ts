import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  ObjectLiteral,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { Category } from '../categories/entities/category.entity';
import { Department } from '../places/entities/department.entity';
import { Plan } from '../plans/entities/plan.entity';
import { PlanDetail } from '../plans/entities/plan-detail.entity';
import { PermanentJobError } from '../messaging/errors/permanent-job-error';
import { GoogleMapsClientService } from '../external-integration/google-maps/google-maps-client.service';
import { CandidateActivity } from './dto/candidate-activity.dto';
import { GeminiClientService } from './gemini/gemini-client.service';
import { PlanRequest, PlanRequestMode } from './entities/plan-request.entity';
import { PlanRequestCategory } from './entities/plan-request-category.entity';
import { UserPreference } from '../users/entities/user-preference.entity';
import { UserPreferenceProfile } from '../users/entities/user-preference-profile.entity';
import { haversineMetersSql } from './geo/haversine.sql';

export type ClaimResult = 'claimed' | 'terminal' | 'skip';

/**
 * Minimum candidate activities in the resolved zone for a plan to be worth
 * composing. CU19 (PAN 09) states that with fewer than two activities nearby
 * the surprise plan is not generated; CU17's automatic flow keeps the looser
 * threshold of one, since its "not enough" case is budget-driven.
 */
const MIN_CANDIDATES_BY_MODE: Record<PlanRequestMode, number> = {
  [PlanRequestMode.Surprise]: 2,
  [PlanRequestMode.Automatic]: 1,
};

/** CU17 and CU19 both cap the result at three alternatives ("hasta 3 opciones"). */
const MAX_ALTERNATIVES_PER_REQUEST = 3;

/** A surprise alternative must be an actual outing: at least two activities. */
const MIN_ACTIVITIES_PER_SURPRISE_PLAN = 2;

/**
 * How long a request may sit in `processing` before its slot is considered
 * abandoned (worker crashed or hung before persisting any Plan). Shared with
 * PlanRequestRecoveryScheduler: the sweep republishes a request once it is
 * this stale, and claim() must treat the same threshold as re-claimable or
 * the redelivered message would just be skipped forever.
 */
export const STALE_PROCESSING_MINUTES = 15;
const STALE_PROCESSING_MS = STALE_PROCESSING_MINUTES * 60 * 1000;

@Injectable()
export class PlanGenerationService {
  private readonly logger = new Logger(PlanGenerationService.name);

  constructor(
    @InjectRepository(PlanRequest)
    private readonly planRequests: Repository<PlanRequest>,
    @InjectRepository(Plan)
    private readonly plans: Repository<Plan>,
    private readonly dataSource: DataSource,
    private readonly gemini: GeminiClientService,
    private readonly googleMaps: GoogleMapsClientService,
  ) {}

  /**
   * Attempts to take ownership of a plan request for processing. See the
   * plan (section 5.4/6): this is the single checkpoint that makes the
   * pipeline idempotent under at-least-once delivery and under the recovery
   * sweep introduced in a later phase.
   */
  async claim(planRequestId: number): Promise<ClaimResult> {
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
        if (!isStale) {
          return 'skip';
        }
      }

      const processingStatusId = await this.statusIdByKey(
        manager.getRepository(PlanRequest),
        'processing',
      );

      await manager.update(PlanRequest, planRequestId, {
        idRequestStatus: processingStatusId,
        processingStartedAt: new Date(),
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
   */
  async resolveIntent(planRequest: PlanRequest): Promise<PlanRequest> {
    if (planRequest.intentResolvedAt !== null) {
      return planRequest;
    }

    const [candidateDepartments, candidateCategories] = await Promise.all([
      this.dataSource.getRepository(Department).find({
        select: { id: true, name: true },
      }),
      this.dataSource.getRepository(Category).find({
        select: { id: true, name: true },
      }),
    ]);

    if (planRequest.mode === PlanRequestMode.Surprise) {
      const preferredCategoryIds = (
        await this.dataSource.getRepository(UserPreference).find({
          where: { idUser: planRequest.idUser },
          select: { idCategory: true },
        })
      ).map((preference) => preference.idCategory);

      return this.persistResolvedIntent(planRequest, {
        budget: null,
        idDepartment: planRequest.idDepartment,
        idOutingType: null,
        availableDuration: null,
        categoryIds: preferredCategoryIds,
      });
    }

    const context = (planRequest.rawContext ?? {}) as {
      budget?: number;
      idDepartment?: number;
      partySize?: number;
      availableDuration?: number;
    };

    const contextDepartmentName = context.idDepartment
      ? candidateDepartments.find((d) => d.id === context.idDepartment)?.name
      : undefined;

    const interpreted = await this.gemini.interpretIntent({
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

    const resolvedDepartment =
      context.idDepartment ??
      candidateDepartments.find((d) => d.name === interpreted.departmentName)
        ?.id ??
      null;

    const resolvedCategoryIds = candidateCategories
      .filter((category) => interpreted.categoryNames.includes(category.name))
      .map((category) => category.id);

    return this.persistResolvedIntent(planRequest, {
      budget: interpreted.budget,
      idDepartment: resolvedDepartment,
      idOutingType: null,
      availableDuration: interpreted.availableDuration,
      categoryIds: resolvedCategoryIds,
    });
  }

  /**
   * Business precondition for automatic requests (plan section 4.4): budget
   * and location must be resolved before composing a plan. Surprise requests
   * only require a location.
   */
  assertRequiredContext(planRequest: PlanRequest): void {
    if (planRequest.mode === PlanRequestMode.Automatic) {
      const missingFields: string[] = [];
      if (planRequest.budget === null) missingFields.push('budget');
      if (planRequest.idDepartment === null) missingFields.push('location');

      if (missingFields.length > 0) {
        throw new PermanentJobError(
          JSON.stringify({ code: 'MISSING_REQUIRED_CONTEXT', missingFields }),
        );
      }
      return;
    }

    if (planRequest.idDepartment === null) {
      throw new PermanentJobError(
        JSON.stringify({ code: 'NO_LOCATION_AVAILABLE' }),
      );
    }
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
    const categoryIds = (
      await this.dataSource.getRepository(PlanRequestCategory).find({
        where: { idPlanRequest: planRequest.id },
      })
    ).map((requestCategory) => requestCategory.idCategory);

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

    await this.applySurpriseDistanceFilter(builder, planRequest);

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

    if (rows.length === 0) return [];

    const categoryNamesByActivity = await this.categoryNamesByActivity(
      rows.map((row) => row.id),
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      estimatedCost: Number(row.estimatedCost),
      estimatedDuration: row.estimatedDuration,
      categoryNames: categoryNamesByActivity.get(row.id) ?? [],
      latitude: row.latitude === null ? null : Number(row.latitude),
      longitude: row.longitude === null ? null : Number(row.longitude),
    }));
  }

  /**
   * CU19 (PAN 09): a surprise plan honours the user's "maximum distance"
   * preference, measured from the location the request was made with (device
   * GPS, or the profile's preferred area used as a fallback — both are stored
   * on `plan_request.rawContext` by `PlanRequestsService.createSurprise`).
   *
   * The radius only applies to surprise requests: CU17's automatic flow has
   * no point of origin in `rawContext` and is bounded by budget instead. When
   * `maxDistanceKm` is not set the department filter is the only spatial
   * bound, which matches the spec ("aplica filtro de distancia según la
   * ubicación obtenida" — the radius comes from the PAN 15 slider, absent
   * when the user never configured one).
   */
  private async applySurpriseDistanceFilter(
    builder: SelectQueryBuilder<ObjectLiteral>,
    planRequest: PlanRequest,
  ): Promise<void> {
    if (planRequest.mode !== PlanRequestMode.Surprise) return;

    const context = (planRequest.rawContext ?? {}) as {
      latitude?: number;
      longitude?: number;
    };
    if (context.latitude == null || context.longitude == null) return;

    const profile = await this.dataSource
      .getRepository(UserPreferenceProfile)
      .findOne({ where: { idUser: planRequest.idUser } });
    if (profile?.maxDistanceKm == null) return;

    builder.andWhere(
      `${haversineMetersSql('activity_place')} <= :maxDistanceMeters`,
      {
        latitude: context.latitude,
        longitude: context.longitude,
        maxDistanceMeters: profile.maxDistanceKm * 1000,
      },
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
    const candidates = await this.findCandidateActivities(planRequest);

    const minCandidates =
      MIN_CANDIDATES_BY_MODE[planRequest.mode] ??
      MIN_CANDIDATES_BY_MODE[PlanRequestMode.Automatic];
    if (candidates.length < minCandidates) {
      throw new PermanentJobError(
        JSON.stringify({ code: 'NO_VALID_COMBINATIONS' }),
      );
    }

    const composedPlans = await this.gemini.composePlans({
      rawQuery: planRequest.rawQuery,
      budget: planRequest.budget,
      availableDuration: planRequest.availableDuration,
      partySize: null,
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
    const validPlans = composedPlans
      .filter((composedPlan) =>
        this.isComposedPlanWithinLimits(
          composedPlan,
          planRequest,
          candidatesById,
        ),
      )
      // CU19: a surprise alternative must be a real outing, not a single
      // activity. CU17 keeps whatever the composer returns.
      .filter(
        (composedPlan) =>
          planRequest.mode !== PlanRequestMode.Surprise ||
          composedPlan.activities.length >= MIN_ACTIVITIES_PER_SURPRISE_PLAN,
      )
      // CU17 and CU19 both surface at most three alternatives. The Gemini
      // prompt asks for "between 1 and 3", but the cap is enforced here so a
      // drifting response can never persist more.
      .slice(0, MAX_ALTERNATIVES_PER_REQUEST);

    if (validPlans.length === 0) {
      throw new PermanentJobError(
        JSON.stringify({ code: 'NO_VALID_COMBINATIONS' }),
      );
    }

    const routeByPlan = await Promise.all(
      validPlans.map((composedPlan) =>
        this.calculateComposedPlanRoute(composedPlan, candidatesById),
      ),
    );

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
      categoryIds: number[];
    },
  ): Promise<PlanRequest> {
    return this.dataSource.transaction(async (manager) => {
      await manager.update(PlanRequest, planRequest.id, {
        budget: resolved.budget,
        idDepartment: resolved.idDepartment,
        idOutingType: resolved.idOutingType,
        availableDuration: resolved.availableDuration,
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
