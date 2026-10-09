import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import type { ConsumeMessage } from 'amqplib';
import { CommonEnvironmentVariables } from '../../../config/environment-variables';
import { ExternalSyncService } from '../../../external-integration/external-sync.service';
import {
  EXTERNAL_SYNC_QUEUE,
  JOBS_EXCHANGE,
  EXTERNAL_SYNC_ROUTING_KEY,
  readMetadata,
} from '../../constants';
import { PermanentJobError } from '../../errors/permanent-job-error';
import { RetryableJobError } from '../../errors/retryable-job-error';
import { readRetryParameters } from '../../messaging.config';
import type { ExternalSyncPayload } from '../../types/job-type';
import type { JobEnvelope } from '../../types/job-envelope';
import { JobProcessorService } from '../job-processor.service';

@Injectable()
export class ExternalSyncHandler {
  private readonly logger = new Logger(ExternalSyncHandler.name);

  constructor(
    private readonly processor: JobProcessorService,
    private readonly externalSyncService: ExternalSyncService,
    private readonly configuration: ConfigService<
      CommonEnvironmentVariables,
      true
    >,
  ) {}

  @RabbitSubscribe({
    exchange: JOBS_EXCHANGE,
    routingKey: EXTERNAL_SYNC_ROUTING_KEY,
    queue: EXTERNAL_SYNC_QUEUE,
    createQueueIfNotExists: false,
  })
  async handle(
    envelope: JobEnvelope<ExternalSyncPayload>,
    amqpMsg: ConsumeMessage,
  ): Promise<void> {
    return this.processor.process(envelope, amqpMsg, (s) =>
      this.execute(s, amqpMsg),
    );
  }

  private async execute(
    envelope: JobEnvelope<ExternalSyncPayload>,
    amqpMsg: ConsumeMessage,
  ): Promise<void> {
    const { externalSyncId } = envelope.payload;

    try {
      await this.externalSyncService.run(externalSyncId);
    } catch (error) {
      const jobError = this.classify(error);
      const willRetry =
        jobError instanceof RetryableJobError &&
        !this.attemptsExhausted(amqpMsg);

      if (!willRetry) {
        // A failing markFailed must not replace the error that caused it: the
        // dead-letter header has to carry the real root cause.
        try {
          await this.externalSyncService.markFailed(externalSyncId, jobError);
        } catch (markFailedError) {
          this.logger.error(
            `Could not mark external sync ${externalSyncId} as failed.`,
            markFailedError instanceof Error
              ? markFailedError.stack
              : String(markFailedError),
          );
        }
      }

      throw jobError;
    }
  }

  private classify(error: unknown): RetryableJobError | PermanentJobError {
    if (
      error instanceof RetryableJobError ||
      error instanceof PermanentJobError
    ) {
      return error;
    }

    return new RetryableJobError(this.getErrorMessage(error), error);
  }

  private attemptsExhausted(amqpMsg: ConsumeMessage): boolean {
    const { maxAttempts } = readRetryParameters(this.configuration);
    const { attempt } = readMetadata(amqpMsg);

    return attempt >= maxAttempts;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
