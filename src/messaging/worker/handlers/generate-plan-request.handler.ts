import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import type { ConsumeMessage } from 'amqplib';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  JOBS_EXCHANGE,
  GENERATE_PLAN_REQUEST_QUEUE,
  GENERATE_PLAN_REQUEST_ROUTING_KEY,
  readMetadata,
} from '../../constants';
import { CommonEnvironmentVariables } from '../../../config/environment-variables';
import { readRetryParameters } from '../../messaging.config';
import { PermanentJobError } from '../../errors/permanent-job-error';
import type { JobEnvelope } from '../../types/job-envelope';
import type { GeneratePlanRequestPayload } from '../../types/job-type';
import { JobProcessorService } from '../job-processor.service';
import { PlanGenerationService } from '../../../recommendation/plan-generation.service';
import { PlanRequest } from '../../../recommendation/entities/plan-request.entity';

@Injectable()
export class GeneratePlanRequestHandler {
  private readonly logger = new Logger(GeneratePlanRequestHandler.name);

  constructor(
    private readonly processor: JobProcessorService,
    private readonly planGeneration: PlanGenerationService,
    @InjectRepository(PlanRequest)
    private readonly planRequests: Repository<PlanRequest>,
    private readonly configuration: ConfigService<
      CommonEnvironmentVariables,
      true
    >,
  ) {}

  @RabbitSubscribe({
    exchange: JOBS_EXCHANGE,
    routingKey: GENERATE_PLAN_REQUEST_ROUTING_KEY,
    queue: GENERATE_PLAN_REQUEST_QUEUE,
    createQueueIfNotExists: false,
  })
  async handle(
    envelope: JobEnvelope<GeneratePlanRequestPayload>,
    amqpMsg: ConsumeMessage,
  ): Promise<void> {
    return this.processor.process(envelope, amqpMsg, async (s) => {
      try {
        await this.execute(s, amqpMsg);
      } catch (error) {
        await this.recordFailureIfTerminal(
          s.payload.planRequestId,
          amqpMsg,
          error,
        );
        throw error;
      }
    });
  }

  private async execute(
    envelope: JobEnvelope<GeneratePlanRequestPayload>,
    amqpMsg: ConsumeMessage,
  ): Promise<void> {
    const { planRequestId } = envelope.payload;

    const claimResult = await this.planGeneration.claim(
      planRequestId,
      readMetadata(amqpMsg).attempt > 1,
    );
    if (claimResult === 'terminal' || claimResult === 'skip') {
      return;
    }

    const alreadyGenerated =
      await this.planGeneration.closeIfAlreadyGenerated(planRequestId);
    if (alreadyGenerated) {
      return;
    }

    const planRequest = await this.planRequests.findOneOrFail({
      where: { id: planRequestId },
    });

    const resolved = await this.planGeneration.resolveIntent(planRequest);
    this.planGeneration.assertRequiredContext(resolved);

    await this.planGeneration.composeAndPersistPlans(resolved);
  }

  private async recordFailureIfTerminal(
    planRequestId: number,
    amqpMsg: ConsumeMessage,
    error: unknown,
  ): Promise<void> {
    const metadata = readMetadata(amqpMsg);
    const { maxAttempts } = readRetryParameters(this.configuration);
    const isPermanent = error instanceof PermanentJobError;
    const attemptsExhausted = metadata.attempt >= maxAttempts;

    if (!isPermanent && !attemptsExhausted) {
      return;
    }

    const { failureCode, failureDetail } = this.parseFailure(error);

    try {
      await this.planRequests
        .createQueryBuilder()
        .update(PlanRequest)
        .set({
          idRequestStatus: await this.failedStatusId(),
          failureCode,
          failureDetail: () => ':failureDetail',
          failedAt: new Date(),
        })
        .setParameter('failureDetail', JSON.stringify(failureDetail ?? {}))
        .where('id = :id', { id: planRequestId })
        .execute();
    } catch (persistError) {
      this.logger.error(
        `Could not persist terminal failure for plan request ${planRequestId}`,
        persistError instanceof Error
          ? persistError.stack
          : String(persistError),
      );
    }
  }

  private parseFailure(error: unknown): {
    failureCode: string;
    failureDetail: Record<string, unknown> | null;
  } {
    const message = error instanceof Error ? error.message : String(error);

    try {
      const parsed: unknown = JSON.parse(message);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'code' in parsed &&
        typeof (parsed as { code: unknown }).code === 'string'
      ) {
        const { code, ...detail } = parsed as { code: string } & Record<
          string,
          unknown
        >;
        return { failureCode: code, failureDetail: detail };
      }
    } catch {
      // not a structured failure, fall through to the generic code below
    }

    return { failureCode: 'GENERATION_FAILED', failureDetail: null };
  }

  private async failedStatusId(): Promise<number> {
    const status = await this.planRequests.manager
      .createQueryBuilder()
      .select('status.id', 'id')
      .from('request_status', 'status')
      .where('status.key = :key', { key: 'failed' })
      .getRawOne<{ id: number }>();

    if (!status) {
      throw new Error(
        'Missing request_status seed value "failed". Run pnpm db:seed.',
      );
    }

    return status.id;
  }
}
