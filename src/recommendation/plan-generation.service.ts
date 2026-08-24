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
import { PlanRequest, PlanRequestMode } from './entities/plan-request.entity';
import { PlanRequestCategory } from './entities/plan-request-category.entity';
import { UserPreference } from '../users/entities/user-preference.entity';

export type ClaimResult = 'claimed' | 'terminal' | 'skip';

const MIN_CANDIDATES_REQUIRED = 1;

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
        return 'terminal';
      }

      if (request.status.key === 'processing') {
        return 'skip';
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
   * Composes plans from the candidate set via Gemini and persists them as
   * real Plan/PlanDetail rows. Follows the geographic/composition validation
   * policy (plan section 16): an alternative with no surviving activities is
   * discarded, not retried; NO_VALID_COMBINATIONS is permanent if none of
   * the composed alternatives survive.
   */
  async composeAndPersistPlans(planRequest: PlanRequest): Promise<void> {
    const candidates = await this.findCandidateActivities(planRequest);

    if (candidates.length < MIN_CANDIDATES_REQUIRED) {
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

    const routeByPlan = await Promise.all(
      composedPlans.map((composedPlan) =>
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

      for (const [index, composedPlan] of composedPlans.entries()) {
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
