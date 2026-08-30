import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EnvironmentVariables } from '../config/environment-variables';
import { MessagingService } from '../messaging/messaging.service';
import { JobType } from '../messaging/types/job-type';
import { Plan } from '../plans/entities/plan.entity';
import { PlansService } from '../plans/plans.service';
import { CreatePlanRequestDto } from './dto/create-plan-request.dto';
import { CreateSurprisePlanRequestDto } from './dto/create-surprise-plan-request.dto';
import {
  PlanRequestAcceptedDto,
  PlanRequestStatusDto,
} from './dto/plan-request-response.dto';
import { PlanRequest, PlanRequestMode } from './entities/plan-request.entity';
import { GeographicResolutionService } from './geographic-resolution.service';

const ACTIVE_REQUEST_STATUS_KEYS = ['pending', 'processing'];

@Injectable()
export class PlanRequestsService {
  private readonly logger = new Logger(PlanRequestsService.name);
  private readonly maxActiveRequestsPerUser: number;

  constructor(
    @InjectRepository(PlanRequest)
    private readonly planRequests: Repository<PlanRequest>,
    private readonly messaging: MessagingService,
    private readonly configuration: ConfigService<EnvironmentVariables, true>,
    private readonly geographicResolution: GeographicResolutionService,
    private readonly plansService: PlansService,
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
    await this.assertBelowActiveLimit(userId);

    const planRequest = await this.planRequests.save(
      this.planRequests.create({
        idUser: userId,
        mode: PlanRequestMode.Automatic,
        rawQuery: dto.query,
        rawContext: dto.context ? { ...dto.context } : null,
        requestedAt: new Date(),
        idRequestStatus: await this.pendingStatusId(),
      }),
    );

    await this.publishOrFail(planRequest);

    return this.toAccepted(planRequest);
  }

  async createSurprise(
    userId: number,
    dto: CreateSurprisePlanRequestDto,
  ): Promise<PlanRequestAcceptedDto> {
    await this.assertBelowActiveLimit(userId);

    if (dto.latitude == null || dto.longitude == null) {
      throw new ConflictException({
        code: 'NO_LOCATION_AVAILABLE',
        message: 'A location is required to generate a surprise plan',
      });
    }

    const idDepartment = await this.geographicResolution.nearestDepartment(
      dto.latitude,
      dto.longitude,
    );

    if (idDepartment === null) {
      throw new ConflictException({
        code: 'NO_LOCATION_AVAILABLE',
        message: 'A location is required to generate a surprise plan',
      });
    }

    const planRequest = await this.planRequests.save(
      this.planRequests.create({
        idUser: userId,
        mode: PlanRequestMode.Surprise,
        idDepartment,
        rawContext: { latitude: dto.latitude, longitude: dto.longitude },
        requestedAt: new Date(),
        idRequestStatus: await this.pendingStatusId(),
      }),
    );

    await this.publishOrFail(planRequest);

    return this.toAccepted(planRequest);
  }

  async findStatus(id: number, userId: number): Promise<PlanRequestStatusDto> {
    const planRequest = await this.planRequests.findOne({
      where: { id },
      relations: { status: true },
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

    const plans =
      planRequest.status.key === 'generated'
        ? await this.findPlansForRequest(planRequest.id, userId)
        : undefined;

    return {
      id: planRequest.id,
      statusKey: planRequest.status.key,
      mode: planRequest.mode,
      requestedAt: planRequest.requestedAt,
      plans,
      failedAt: planRequest.failedAt,
      failureCode: planRequest.failureCode,
      failureDetail: planRequest.failureDetail,
    };
  }

  private async findPlansForRequest(
    planRequestId: number,
    userId: number,
  ): Promise<PlanRequestStatusDto['plans']> {
    const planIds = await this.planRequests.manager
      .getRepository(Plan)
      .find({ where: { idPlanRequest: planRequestId }, select: { id: true } });

    // The caller owns this request (checked above), so pass the id through:
    // the plans come back with the right `viewerPlanState` for CU22.
    return Promise.all(
      planIds.map(({ id }) => this.plansService.findOne(id, userId)),
    );
  }

  private async publishOrFail(planRequest: PlanRequest): Promise<void> {
    try {
      await this.messaging.publish(JobType.GeneratePlanRequest, {
        planRequestId: planRequest.id,
      });
    } catch (error) {
      this.logger.error(
        `Could not publish generation job for plan request ${planRequest.id}`,
        error instanceof Error ? error.stack : String(error),
      );

      await this.planRequests.update(planRequest.id, {
        idRequestStatus: await this.failedStatusId(),
        failureCode: 'GENERATION_UNAVAILABLE',
        failedAt: new Date(),
      });

      throw new ServiceUnavailableException({
        code: 'GENERATION_UNAVAILABLE',
        message: 'The plan generation service is temporarily unavailable',
        planRequestId: planRequest.id,
      });
    }
  }

  private async assertBelowActiveLimit(userId: number): Promise<void> {
    const activeCount = await this.planRequests
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

  private toAccepted(planRequest: PlanRequest): PlanRequestAcceptedDto {
    return {
      id: planRequest.id,
      statusKey: 'pending',
      mode: planRequest.mode,
      requestedAt: planRequest.requestedAt,
    };
  }

  private async pendingStatusId(): Promise<number> {
    return this.statusIdByKey('pending');
  }

  private async failedStatusId(): Promise<number> {
    return this.statusIdByKey('failed');
  }

  private async statusIdByKey(key: string): Promise<number> {
    const status = await this.planRequests.manager
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
