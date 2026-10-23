import { PlanRequestExpirationService } from './plan-request-expiration.service';
import {
  GenerationTimeoutError,
  assertGenerationTime,
  withinGenerationDeadline,
  withGenerationClock,
  generationNow,
  remainingGenerationMs,
} from './generation-deadline';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { LanguageObservationService } from '../planning-engine/language/language-observation.service';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { EnvironmentVariables } from '../config/environment-variables';
import { MessagingService } from '../messaging/messaging.service';
import { JobType } from '../messaging/types/job-type';
import { Plan } from '../plans/entities/plan.entity';
import { PlansService } from '../plans/plans.service';
import { Department } from '../places/entities/department.entity';
import { UserPreferenceProfileLookupService } from '../users/user-preference-profile-lookup.service';
import { CreatePlanRequestDto } from './dto/create-plan-request.dto';
import { CreateSurprisePlanRequestDto } from './dto/create-surprise-plan-request.dto';
import { RefinePlanRequestDto } from './dto/refine-plan-request.dto';
import {
  RefinementError,
  refineIntent,
  refinementSpec,
  type BaseStop,
  type RefinementSpec,
} from '../planning-engine/refinement/refinement';
import {
  PlanFunnelDto,
  PlanRequestAcceptedDto,
  PlanRequestStatusDto,
  PlanRequestSummaryDto,
} from './dto/plan-request-response.dto';
import {
  createPaginatedResponse,
  PaginatedResponse,
} from '../common/pagination/paginated-response';
import { ListPlanRequestsQueryDto } from './dto/list-plan-requests-query.dto';
import {
  EXPERIENCES,
  isExperienceKey,
} from '../planning-engine/intent/experiences';
import { understandingOf } from '../planning-engine/intent/understanding';
import { PlanRequest, PlanRequestMode } from './entities/plan-request.entity';
import { GeographicResolutionService } from './geographic-resolution.service';

const ACTIVE_REQUEST_STATUS_KEYS = ['pending', 'processing'];
/** Failed and expired searches have nothing to reopen, so they are not listed. */
const LISTED_REQUEST_STATUS_KEYS = [...ACTIVE_REQUEST_STATUS_KEYS, 'generated'];
const SUMMARY_PLAN_TITLE_LIMIT = 3;
/** A generated search whose plans are all gone has nothing to reopen either. */
const GENERATED_WITH_PLANS_CONDITION = `(status.key <> 'generated' OR EXISTS (
  SELECT 1 FROM "plan" listed_plan
  WHERE listed_plan.id_plan_request = "planRequest".id
    AND listed_plan.deleted_at IS NULL
))`;
const ETA_SAMPLE_WINDOW = '30 days';
const ETA_MINIMUM_SAMPLE_COUNT = 20;
const ETA_CACHE_TTL_MS = 10 * 60 * 1000;

const ROLE_ORDER = ['BEST', 'VALUE', 'DIFFERENT', 'ALTERNATIVE'];

/** The real anchor funnel recorded by the planner, if it ran. */
function funnelOf(trace: Record<string, unknown> | null): PlanFunnelDto | null {
  const anchor = trace?.anchorFunnel as
    | {
        experience?: string;
        places?: number;
        openAtTime?: number;
        confirmedOpenAtTime?: number;
        knownWithinBudget?: number | null;
        withPrice?: number;
        fitsCharacter?: number;
        character?: string | null;
      }
    | null
    | undefined;
  if (!trace || !anchor || typeof anchor.places !== 'number') return null;
  const verification = trace.verification as
    | { locations?: number; hours?: number }
    | undefined;
  const experience = anchor.experience;
  return {
    experienceLabel:
      experience && isExperienceKey(experience)
        ? EXPERIENCES[experience].label
        : 'el plan',
    places: anchor.places,
    openAtTime: anchor.openAtTime ?? 0,
    confirmedOpenAtTime: anchor.confirmedOpenAtTime,
    knownWithinBudget: anchor.knownWithinBudget ?? null,
    ...(typeof anchor.withPrice === 'number'
      ? { withPrice: anchor.withPrice }
      : {}),
    ...(typeof anchor.fitsCharacter === 'number' && anchor.fitsCharacter > 0
      ? { fitsCharacter: anchor.fitsCharacter, character: anchor.character }
      : {}),
    combinations: Number(trace.combinationsEvaluated ?? 0),
    proposals: Number(trace.proposals ?? 0),
    verifiedLive:
      Number(verification?.locations ?? 0) + Number(verification?.hours ?? 0),
  };
}

function unsupportedOf(trace: Record<string, unknown> | null): string[] {
  const list = trace?.unsupportedExperiences;
  return Array.isArray(list)
    ? list
        .filter((key): key is string => typeof key === 'string')
        .map((key) => (isExperienceKey(key) ? EXPERIENCES[key].label : key))
    : [];
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

@Injectable()
export class PlanRequestsService {
  private readonly logger = new Logger(PlanRequestsService.name);
  private readonly maxActiveRequestsPerUser: number;
  private readonly generationDurationCache = new Map<
    string,
    {
      loadedAt: number;
      sampleCount: number;
      medianMs: number | null;
      p95Ms: number | null;
    }
  >();

  constructor(
    @InjectRepository(PlanRequest)
    private readonly planRequests: Repository<PlanRequest>,
    private readonly messaging: MessagingService,
    private readonly configuration: ConfigService<EnvironmentVariables, true>,
    private readonly geographicResolution: GeographicResolutionService,
    private readonly plansService: PlansService,
    private readonly preferenceProfiles: UserPreferenceProfileLookupService,
    @InjectRepository(Department)
    private readonly departments: Repository<Department>,
    private readonly expiration: PlanRequestExpirationService,
    @Optional()
    private readonly languageObservations?: LanguageObservationService,
  ) {
    this.maxActiveRequestsPerUser = Number(
      this.configuration.get('MAX_ACTIVE_PLAN_REQUESTS_PER_USER', {
        infer: true,
      }) ?? 3,
    );
  }

  async createAutomatic(
    userId: number,
    dto: CreatePlanRequestDto,
  ): Promise<PlanRequestAcceptedDto> {
    const startedAt = new Date();
    return this.acceptWithinDeadline(startedAt, () =>
      withGenerationClock(
        () =>
          this.planRequests.manager.query<{ now: Date }[]>(
            'SELECT clock_timestamp() AS now',
          ),
        () => {
          // Preserve time spent acquiring the database clock in the budget.
          const requestedAt = new Date(
            startedAt.getTime() + generationNow() - Date.now(),
          );
          return this.acceptWithinDeadline(requestedAt, () =>
            this.prepareAutomatic(userId, dto, requestedAt),
          );
        },
      ),
    );
  }

  async createSurprise(
    userId: number,
    dto: CreateSurprisePlanRequestDto,
  ): Promise<PlanRequestAcceptedDto> {
    const startedAt = new Date();
    return this.acceptWithinDeadline(startedAt, () =>
      withGenerationClock(
        () =>
          this.planRequests.manager.query<{ now: Date }[]>(
            'SELECT clock_timestamp() AS now',
          ),
        () => {
          // Preserve time spent acquiring the database clock in the budget.
          const requestedAt = new Date(
            startedAt.getTime() + generationNow() - Date.now(),
          );
          return this.acceptWithinDeadline(requestedAt, () =>
            this.prepareSurprise(userId, dto, requestedAt),
          );
        },
      ),
    );
  }

  private async acceptWithinDeadline(
    requestedAt: Date,
    accept: () => Promise<PlanRequestAcceptedDto>,
  ): Promise<PlanRequestAcceptedDto> {
    try {
      return await withinGenerationDeadline(requestedAt, accept);
    } catch (error) {
      if (error instanceof GenerationTimeoutError)
        throw new ServiceUnavailableException({
          code: 'GENERATION_TIMEOUT',
          message: 'The plan request exceeded its time limit',
        });
      throw error;
    }
  }

  private async prepareAutomatic(
    userId: number,
    dto: CreatePlanRequestDto,
    requestedAt: Date,
  ): Promise<PlanRequestAcceptedDto> {
    await this.assertDepartmentExists(dto.context?.idDepartment);
    const planRequest = await this.createPendingRequest(userId, {
      idUser: userId,
      mode: PlanRequestMode.Automatic,
      rawQuery: dto.query,
      rawContext: dto.context ? { ...dto.context } : null,
      requestedAt,
      progressStage: 'queued',
      progressStageAt: requestedAt,
    });

    await this.publishOrFail(planRequest);

    return this.toAccepted(planRequest);
  }

  /**
   * Never fails purely for a missing location (CU19): device coordinates win
   * when the client sent them, otherwise the user's saved preferred area is
   * used as the search centre, and if neither is available the request is
   * still persisted with `idDepartment: null` — `PlanGenerationService`'s
   * `resolveIntent()` closes that last gap with the busiest-department
   * default when the job runs.
   */
  private async prepareSurprise(
    userId: number,
    dto: CreateSurprisePlanRequestDto,
    requestedAt: Date,
  ): Promise<PlanRequestAcceptedDto> {
    const { latitude, longitude } = await this.resolveSurpriseCoordinates(
      userId,
      dto,
    );
    const idDepartment =
      latitude != null && longitude != null
        ? await this.geographicResolution.nearestDepartment(latitude, longitude)
        : null;

    const planRequest = await this.createPendingRequest(userId, {
      idUser: userId,
      mode: PlanRequestMode.Surprise,
      idDepartment,
      rawContext:
        latitude != null && longitude != null ? { latitude, longitude } : null,
      requestedAt,
      progressStage: 'queued',
      progressStageAt: requestedAt,
    });

    await this.publishOrFail(planRequest);

    return this.toAccepted(planRequest);
  }

  private async resolveSurpriseCoordinates(
    userId: number,
    dto: CreateSurprisePlanRequestDto,
  ): Promise<{ latitude: number | null; longitude: number | null }> {
    if (dto.latitude != null && dto.longitude != null) {
      return { latitude: dto.latitude, longitude: dto.longitude };
    }

    const profile = await this.preferenceProfiles.findByUser(userId);
    if (
      profile?.preferredAreaLatitude != null &&
      profile?.preferredAreaLongitude != null
    ) {
      return {
        latitude: profile.preferredAreaLatitude,
        longitude: profile.preferredAreaLongitude,
      };
    }

    return { latitude: null, longitude: null };
  }

  /**
   * The caller's own searches that can still be reopened (#136): generated
   * ones with at least one plan and those still in flight. Plans are only counted and titled here;
   * the full results stay behind `findStatus()`.
   */
  async listOwn(
    userId: number,
    query: ListPlanRequestsQueryDto,
  ): Promise<PaginatedResponse<PlanRequestSummaryDto>> {
    const direction = query.direction === 'asc' ? 'ASC' : 'DESC';
    const [requests, total] = await this.planRequests
      .createQueryBuilder('planRequest')
      .innerJoinAndSelect('planRequest.status', 'status')
      .where('planRequest.idUser = :userId', { userId })
      .andWhere('status.key IN (:...statusKeys)', {
        statusKeys: LISTED_REQUEST_STATUS_KEYS,
      })
      .andWhere(GENERATED_WITH_PLANS_CONDITION)
      .orderBy('planRequest.requestedAt', direction)
      .addOrderBy('planRequest.id', direction)
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    const plans = requests.length
      ? await this.planRequests.manager.getRepository(Plan).find({
          where: { idPlanRequest: In(requests.map(({ id }) => id)) },
          select: { id: true, title: true, idPlanRequest: true },
          order: { id: 'ASC' },
        })
      : [];
    const titlesByRequest = new Map<number, string[]>();
    for (const plan of plans) {
      const titles = titlesByRequest.get(plan.idPlanRequest!) ?? [];
      titles.push(plan.title);
      titlesByRequest.set(plan.idPlanRequest!, titles);
    }

    return createPaginatedResponse(
      requests.map((planRequest) => {
        const titles = titlesByRequest.get(planRequest.id) ?? [];
        return {
          id: planRequest.id,
          statusKey: planRequest.status.key,
          mode: planRequest.mode,
          requestedAt: planRequest.requestedAt,
          query: planRequest.rawQuery,
          planCount: titles.length,
          planTitles: titles.slice(0, SUMMARY_PLAN_TITLE_LIMIT),
        };
      }),
      total,
      query.page,
      query.limit,
    );
  }

  async findStatus(id: number, userId: number): Promise<PlanRequestStatusDto> {
    const startedAt = Date.now();
    await this.expiration.expire(id);
    const planRequest = await this.planRequests.findOne({
      where: { id },
      relations: {
        status: true,
        department: true,
        categories: { category: true },
      },
    });

    if (!planRequest) {
      throw new NotFoundException({
        code: 'PLAN_REQUEST_NOT_FOUND',
        message: 'The requested plan request does not exist',
      });
    }

    if (planRequest.idUser !== userId) {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message: 'You do not have permission to view this plan request',
      });
    }

    const plansStartedAt = Date.now();
    const plans =
      planRequest.status.key === 'generated'
        ? await this.findPlansForRequest(planRequest, userId)
        : undefined;
    const plansLoadMs = plans === undefined ? 0 : Date.now() - plansStartedAt;

    const isInFlight = ACTIVE_REQUEST_STATUS_KEYS.includes(
      planRequest.status.key,
    );
    const estimatedRemainingSeconds = isInFlight
      ? await this.estimatedRemainingSeconds(planRequest)
      : null;

    const response: PlanRequestStatusDto = {
      id: planRequest.id,
      statusKey: planRequest.status.key,
      mode: planRequest.mode,
      requestedAt: planRequest.requestedAt,
      query: planRequest.rawQuery,
      progressStage: planRequest.progressStage,
      progressStageAt: planRequest.progressStageAt,
      estimatedRemainingSeconds,
      plans,
      resolvedContext: this.buildResolvedContext(planRequest),
      understanding: planRequest.resolvedOptions?.intent
        ? understandingOf(
            planRequest.resolvedOptions.intent,
            planRequest.requestedAt,
          )
        : null,
      funnel: funnelOf(planRequest.generationTrace),
      unsupportedExperiences: unsupportedOf(planRequest.generationTrace),
      parentRequestId: planRequest.idParentRequest ?? null,
      failedAt: planRequest.failedAt,
      failureCode: planRequest.failureCode,
      failureDetail: planRequest.failureDetail,
    };

    this.logger.log({
      event: 'plan_request_status_completed',
      planRequestId: planRequest.id,
      statusKey: planRequest.status.key,
      durationMs: Date.now() - startedAt,
      plansLoadMs,
      planCount: plans?.length ?? 0,
    });

    return response;
  }

  /**
   * Uses only anonymized end-to-end durations from recent successful requests.
   * The estimate is hidden until there is a useful same-mode sample, and the
   * aggregate is cached so polling does not add a database query per tick.
   */
  private async estimatedRemainingSeconds(
    planRequest: PlanRequest,
  ): Promise<number | null> {
    const cacheKey = planRequest.mode;
    const cached = this.generationDurationCache.get(cacheKey);
    const now = Date.now();
    let sample = cached;

    if (!sample || now - sample.loadedAt >= ETA_CACHE_TTL_MS) {
      try {
        const result: unknown = await this.planRequests.query(
          `
            SELECT
              COUNT(*)::integer AS "sampleCount",
              percentile_cont(0.5) WITHIN GROUP (
                ORDER BY EXTRACT(EPOCH FROM (request.updated_at - request.requested_at)) * 1000
              ) AS "medianMs",
              percentile_cont(0.95) WITHIN GROUP (
                ORDER BY EXTRACT(EPOCH FROM (request.updated_at - request.requested_at)) * 1000
              ) AS "p95Ms"
            FROM "plan_request" request
            INNER JOIN "request_status" status
              ON status.id = request.id_request_status
            WHERE request.mode = $1
              AND status.key = 'generated'
              AND request.deleted_at IS NULL
              AND request.requested_at >= NOW() - INTERVAL '${ETA_SAMPLE_WINDOW}'
              AND request.id <> $2
          `,
          [planRequest.mode, planRequest.id],
        );
        const rawRow: unknown = Array.isArray(result) ? result[0] : undefined;
        const row: Record<string, unknown> =
          rawRow && typeof rawRow === 'object'
            ? (rawRow as Record<string, unknown>)
            : {};
        sample = {
          loadedAt: now,
          sampleCount: finiteNumber(row.sampleCount) ?? 0,
          medianMs: finiteNumber(row.medianMs),
          p95Ms: finiteNumber(row.p95Ms),
        };
        this.generationDurationCache.set(cacheKey, sample);
        this.logger.log({
          event: 'plan_generation_duration_distribution',
          mode: planRequest.mode,
          window: ETA_SAMPLE_WINDOW,
          sampleCount: sample.sampleCount,
          p50Ms: sample.medianMs,
          p95Ms: sample.p95Ms,
        });
      } catch (error) {
        this.logger.warn({
          event: 'plan_generation_eta_sample_failed',
          mode: planRequest.mode,
          errorClass:
            error instanceof Error ? error.constructor.name : 'unknown',
        });
        return null;
      }
    }

    if (
      !sample ||
      sample.sampleCount < ETA_MINIMUM_SAMPLE_COUNT ||
      sample.medianMs === null
    ) {
      return null;
    }

    const elapsedMs = now - planRequest.requestedAt.getTime();
    if (elapsedMs >= sample.medianMs) return null;
    return Math.ceil((sample.medianMs - elapsedMs) / 1000);
  }

  /**
   * What the system understood from this request — surfaced so the results
   * screen can show it back to the user instead of leaving the answer
   * unexplained. Built straight from the already-loaded row: nothing here
   * needs a fresh query.
   */
  private buildResolvedContext(
    planRequest: PlanRequest,
  ): PlanRequestStatusDto['resolvedContext'] {
    return {
      appliedMaxDistanceKm: planRequest.appliedMaxDistanceKm ?? null,
      budget: planRequest.budget,
      timeOfDay: planRequest.resolvedOptions?.timeOfDay ?? null,
      travelMode: planRequest.resolvedOptions?.travelMode ?? 'drive',
      availableDuration: planRequest.availableDuration ?? null,
      partySize: planRequest.partySize,
      departmentName: planRequest.department?.name ?? null,
      categories: (planRequest.categories ?? []).map(({ category }) => ({
        id: category.id,
        name: category.name,
      })),
    };
  }

  private async findPlansForRequest(
    planRequest: PlanRequest,
    userId: number,
  ): Promise<PlanRequestStatusDto['plans']> {
    const planIds = await this.planRequests.manager.getRepository(Plan).find({
      where: { idPlanRequest: planRequest.id },
      select: { id: true },
      order: { id: 'ASC' },
    });

    // The caller owns this request (checked above), so pass the id through:
    // the plans come back with the right `viewerPlanState` for CU22.
    // Best option first, then value, different and other alternatives.
    const plans = (
      await Promise.all(
        planIds.map(({ id }) => this.plansService.findOne(id, userId)),
      )
    ).sort(
      (left, right) =>
        ROLE_ORDER.indexOf(left.insight?.role ?? 'ALTERNATIVE') -
          ROLE_ORDER.indexOf(right.insight?.role ?? 'ALTERNATIVE') ||
        left.id - right.id,
    );
    const { resolvedLatitude, resolvedLongitude, appliedMaxDistanceKm } =
      planRequest;
    if (
      resolvedLatitude == null ||
      resolvedLongitude == null ||
      appliedMaxDistanceKm == null
    )
      return plans;
    const radians = (degrees: number): number => (degrees * Math.PI) / 180;
    return plans.map((plan) => ({
      ...plan,
      details: plan.details.map((detail) => ({
        ...detail,
        activity: detail.activity && {
          ...detail.activity,
          locations: detail.activity.locations.filter((location) => {
            if (
              location.latitude == null ||
              location.longitude == null ||
              location.place.department.id !== planRequest.idDepartment
            )
              return false;
            const cosine =
              Math.cos(radians(resolvedLatitude)) *
                Math.cos(radians(location.latitude)) *
                Math.cos(radians(location.longitude - resolvedLongitude)) +
              Math.sin(radians(resolvedLatitude)) *
                Math.sin(radians(location.latitude));
            return (
              6371 * Math.acos(Math.min(1, Math.max(-1, cosine))) <=
              appliedMaxDistanceKm
            );
          }),
        },
      })),
    }));
  }

  private async publishOrFail(planRequest: PlanRequest): Promise<void> {
    const startedAt = generationNow();
    this.logger.log({
      event: 'plan_request_prepared',
      planRequestId: planRequest.id,
      durationMs: startedAt - planRequest.requestedAt.getTime(),
    });
    try {
      assertGenerationTime(planRequest.requestedAt);
      await this.messaging.publish(JobType.GeneratePlanRequest, {
        planRequestId: planRequest.id,
      });
      this.logger.log({
        event: 'plan_request_published',
        planRequestId: planRequest.id,
        durationMs: generationNow() - startedAt,
      });
    } catch (error) {
      this.logger.error(
        `Could not publish generation job for plan request ${planRequest.id}`,
        error instanceof Error ? error.stack : String(error),
      );

      const code =
        remainingGenerationMs(planRequest.requestedAt) === 0
          ? 'GENERATION_TIMEOUT'
          : 'GENERATION_UNAVAILABLE';
      await this.planRequests.query(
        `UPDATE plan_request SET id_request_status = $1, failure_code = $2, failed_at = clock_timestamp()
         WHERE id = $3 AND id_request_status IN (SELECT id FROM request_status WHERE key IN ('pending', 'processing'))`,
        [await this.failedStatusId(), code, planRequest.id],
      );

      throw new ServiceUnavailableException({
        code,
        message: 'The plan generation service is temporarily unavailable',
        planRequestId: planRequest.id,
      });
    }
  }

  private async assertBelowActiveLimit(
    userId: number,
    repository: Repository<PlanRequest> = this.planRequests,
  ): Promise<void> {
    const activeCount = await repository
      .createQueryBuilder('request')
      .innerJoin('request.status', 'status')
      .where('request.id_user = :userId', { userId })
      .andWhere('status.key IN (:...keys)', {
        keys: ACTIVE_REQUEST_STATUS_KEYS,
      })
      .getCount();

    if (activeCount >= this.maxActiveRequestsPerUser) {
      throw new HttpException(
        {
          code: 'TOO_MANY_ACTIVE_REQUESTS',
          message: 'You already have too many plan requests in progress',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async assertDepartmentExists(
    idDepartment: number | undefined,
  ): Promise<void> {
    if (idDepartment === undefined) return;
    if (!(await this.departments.exists({ where: { id: idDepartment } }))) {
      throw new ConflictException({
        code: 'DEPARTMENT_NOT_FOUND',
        message: 'The selected location does not exist',
      });
    }
  }

  /**
   * "Más barato", "Cambiar esta parada"…: a child request of the search that
   * keeps the base plan's structure and pinned stops and re-solves only what
   * changed (refinement.ts). It runs through the same queue as any search.
   */
  async refine(
    userId: number,
    parentId: number,
    dto: RefinePlanRequestDto,
  ): Promise<PlanRequestAcceptedDto> {
    const parent = await this.planRequests.findOne({
      where: { id: parentId, idUser: userId },
    });
    if (!parent) throw new NotFoundException('Plan request not found');
    const intent = parent.resolvedOptions?.intent;
    if (!intent)
      throw new ConflictException({
        code: 'NOT_REFINABLE',
        message: 'This search cannot be refined',
      });
    const rows = await this.planRequests.manager.query<
      {
        id_plan: number;
        ranking_meta: Record<string, unknown> | null;
        id_activity: number | null;
        id_place: number | null;
        action: string | null;
        start_minute: number | null;
        estimate_basis: Record<string, unknown> | null;
      }[]
    >(
      `SELECT p.id AS id_plan, p.ranking_meta, d.id_activity, d.id_place, d.action,
              d.start_minute, d.estimate_basis
         FROM plan p JOIN plan_detail d ON d.id_plan = p.id AND d.deleted_at IS NULL
        WHERE p.id = $1 AND p.id_plan_request = $2 AND p.id_user = $3 AND p.deleted_at IS NULL
        ORDER BY d."order"`,
      [dto.planId, parent.id, userId],
    );
    if (!rows.length)
      throw new NotFoundException('Plan not found in this search');
    const traceShape = (
      (parent.generationTrace?.shape as
        | { id: string; role: string; experiences: string[] }[]
        | undefined) ?? []
    ).filter((slot) => slot && typeof slot.id === 'string');
    const meta = rows[0].ranking_meta;
    const components = Array.isArray(meta?.components)
      ? (meta.components as { key?: string }[])
      : [];
    const stops: BaseStop[] = rows.map((row, index) => {
      const basis = row.estimate_basis ?? {};
      const screening = basis.screening as { id?: number } | undefined;
      const key =
        components[index]?.key ??
        (row.id_activity
          ? `o:${row.id_activity}`
          : screening?.id
            ? `s:${screening.id}`
            : `p:${row.id_place}:${row.action}`);
      const role =
        typeof basis.slotRole === 'string' ? basis.slotRole : 'ANCHOR';
      const experience =
        typeof basis.experience === 'string' ? basis.experience : null;
      const slotId =
        typeof basis.slotId === 'string'
          ? basis.slotId
          : (traceShape.find(
              (slot) =>
                slot.role === role &&
                (experience === null || slot.experiences.includes(experience)),
            )?.id ?? `slot-${index}`);
      return {
        slotId,
        slotRole: role,
        key,
        placeId: Number(row.id_place),
        start: row.start_minute,
      };
    });
    let spec: RefinementSpec;
    try {
      spec = refinementSpec(
        dto.action,
        dto.planId,
        stops,
        dto.stopIndex ?? null,
        traceShape,
      );
    } catch (error) {
      if (error instanceof RefinementError)
        throw new ConflictException({
          code: error.code,
          message: error.message,
        });
      throw error;
    }
    const requestedAt = new Date();
    const planRequest = await this.createPendingRequest(userId, {
      idUser: userId,
      mode: parent.mode,
      rawQuery: parent.rawQuery,
      rawContext: parent.rawContext,
      idDepartment: parent.idDepartment,
      budget: parent.budget,
      partySize: parent.partySize,
      availableDuration: parent.availableDuration,
      resolvedLatitude: parent.resolvedLatitude,
      resolvedLongitude: parent.resolvedLongitude,
      appliedMaxDistanceKm: parent.appliedMaxDistanceKm,
      resolvedOptions: {
        ...parent.resolvedOptions!,
        intent: refineIntent(intent, spec),
        refinement: spec,
      },
      intentResolvedAt: requestedAt,
      idParentRequest: parent.id,
      requestedAt,
      progressStage: 'queued',
      progressStageAt: requestedAt,
    });
    await this.planRequests.manager
      .query(
        `INSERT INTO plan_event (id_user, id_plan, id_plan_request, type, stop_ref, payload)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          userId,
          dto.planId,
          planRequest.id,
          dto.action === 'SWAP_STOP'
            ? 'STOP_SWAPPED'
            : dto.action === 'REMOVE_STOP'
              ? 'STOP_REMOVED'
              : 'REFINEMENT_APPLIED',
          dto.stopIndex !== undefined
            ? { index: dto.stopIndex, key: stops[dto.stopIndex]?.key }
            : null,
          { action: dto.action, parentRequestId: parent.id },
        ],
      )
      .catch((error: unknown) =>
        this.logger.warn(
          `Refinement event lost: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    // A phrase after which the person had to adjust the plan: a sign the
    // first reading missed. Only the wording of the style is kept.
    const styleWords = (intent.facets ?? [])
      .filter((facet) => facet.polarity === 'want' && facet.phrase)
      .map((facet) => facet.phrase!.split(' / ')[0]);
    if (dto.action !== 'SWAP_STOP' && dto.action !== 'REMOVE_STOP')
      void this.languageObservations?.record([
        {
          kind: 'REFINEMENT',
          phrase: `${dto.action.toLowerCase().replace(/_/g, ' ')} tras ${styleWords[0] ?? 'pedido sin estilo'}`,
          reading: { action: dto.action },
        },
      ]);
    await this.publishOrFail(planRequest);
    return this.toAccepted(planRequest);
  }

  private async createPendingRequest(
    userId: number,
    values: Partial<PlanRequest>,
  ): Promise<PlanRequest> {
    return this.planRequests.manager.transaction(async (manager) => {
      assertGenerationTime(values.requestedAt!);
      await manager.query(
        "SELECT set_config('statement_timeout', $1, true), set_config('lock_timeout', $1, true)",
        [String(remainingGenerationMs(values.requestedAt!))],
      );
      await manager.query('SELECT pg_advisory_xact_lock($1)', [userId]);
      const repository = manager.getRepository(PlanRequest);
      await this.assertBelowActiveLimit(userId, repository);
      assertGenerationTime(values.requestedAt!);
      const saved = await repository.save(
        repository.create({
          ...values,
          idRequestStatus: await this.pendingStatusId(repository),
        }),
      );
      assertGenerationTime(values.requestedAt!);
      return saved;
    });
  }

  private toAccepted(planRequest: PlanRequest): PlanRequestAcceptedDto {
    return {
      id: planRequest.id,
      statusKey: 'pending',
      mode: planRequest.mode,
      requestedAt: planRequest.requestedAt,
    };
  }

  private async pendingStatusId(
    repository: Repository<PlanRequest> = this.planRequests,
  ): Promise<number> {
    return this.statusIdByKey('pending', repository);
  }

  private async failedStatusId(): Promise<number> {
    return this.statusIdByKey('failed', this.planRequests);
  }

  private async statusIdByKey(
    key: string,
    repository: Repository<PlanRequest>,
  ): Promise<number> {
    const status = await repository.manager
      .createQueryBuilder()
      .select('status.id', 'id')
      .from('request_status', 'status')
      .where('status.key = :key', { key })
      .getRawOne<{ id: number }>();

    if (!status) {
      throw new Error(
        `Missing request_status seed value "${key}". Run pnpm db:seed.`,
      );
    }

    return status.id;
  }
}
