import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { ConsumeMessage, Options } from 'amqplib';
import { CommonEnvironmentVariables } from '../../config/environment-variables';
import {
  FAILED_EXCHANGE,
  RETRY_EXCHANGE,
  ERROR_HEADER,
  ERROR_CLASS_HEADER,
  ATTEMPT_HEADER,
  TYPE_HEADER,
  readMetadata,
  JobMetadata,
  failedRoutingKey,
  retryRoutingKey,
} from '../constants';
import { readRetryParameters, PUBLISH_TIMEOUT_MS } from '../messaging.config';
import { PermanentJobError } from '../errors/permanent-job-error';
import { JobEnvelope } from '../types/job-envelope';

type PublishOptionsInterna = Options.Publish & { timeout?: number };

const MAX_LENGTH_MENSAJE_ERROR = 500;

@Injectable()
export class JobProcessorService {
  private readonly logger = new Logger(JobProcessorService.name);

  constructor(
    private readonly amqp: AmqpConnection,
    private readonly configuration: ConfigService<
      CommonEnvironmentVariables,
      true
    >,
  ) {}

  async process<T>(
    envelope: JobEnvelope<T>,
    amqpMsg: ConsumeMessage,
    execute: (envelope: JobEnvelope<T>) => Promise<void>,
  ): Promise<void> {
    const metadata = readMetadata(amqpMsg);
    const home = Date.now();

    this.logger.log({
      event: 'job_started',
      id: metadata.id,
      type: metadata.type,
      attempt: metadata.attempt,
      correlationId: metadata.correlationId,
      redelivered: amqpMsg.fields.redelivered,
    });

    try {
      await execute(envelope);

      this.logger.log({
        event: 'job_completed',
        id: metadata.id,
        type: metadata.type,
        attempt: metadata.attempt,
        correlationId: metadata.correlationId,
        durationMs: Date.now() - home,
      });

      return;
    } catch (jobError) {
      await this.handleFailure(envelope, metadata, jobError);
    }
  }

  private async handleFailure<T>(
    envelope: JobEnvelope<T>,
    metadata: JobMetadata,
    jobError: unknown,
  ): Promise<void> {
    const { maxAttempts } = readRetryParameters(this.configuration);

    const permanent = jobError instanceof PermanentJobError;
    const agotado = metadata.attempt >= maxAttempts;
    const destination: 'reattempt' | 'dlq' =
      !permanent && !agotado ? 'reattempt' : 'dlq';

    try {
      if (destination === 'reattempt') {
        const delayMs = await this.requeueWithDelay(envelope, metadata);
        this.logger.log({
          event: 'job_retry_scheduled',
          id: metadata.id,
          type: metadata.type,
          attempt: metadata.attempt,
          proximoIntento: metadata.attempt + 1,
          delayMs,
          correlationId: metadata.correlationId,
          error: this.getErrorMessage(jobError),
        });
      } else {
        await this.sendToFailedQueue(envelope, metadata, jobError);
        this.logger.log({
          event: 'job_dead_lettered',
          id: metadata.id,
          type: metadata.type,
          attempt: metadata.attempt,
          correlationId: metadata.correlationId,
          motivo: permanent ? 'permanent' : 'attempts_agotados',
        });
      }
    } catch (publishError) {
      this.logger.error({
        event: 'job_infra_failure',
        id: metadata.id,
        type: metadata.type,
        attempt: metadata.attempt,
        correlationId: metadata.correlationId,
        attemptedDestination: destination,
        originalError: this.getErrorMessage(jobError),
        publishError: this.getErrorMessage(publishError),
      });

      throw publishError;
    }

    this.logger.log({
      event: 'job_failed',
      id: metadata.id,
      type: metadata.type,
      attempt: metadata.attempt,
      correlationId: metadata.correlationId,
      error: this.getErrorMessage(jobError),
      errorClase: this.getErrorClass(jobError),
    });

    if (jobError instanceof Error) {
      this.logger.error(jobError.message, jobError.stack);
    }
  }

  private async requeueWithDelay<T>(
    envelope: JobEnvelope<T>,
    metadata: JobMetadata,
  ): Promise<number> {
    const { retryDelaysMs } = readRetryParameters(this.configuration);
    const delayIndex = metadata.attempt - 1;
    const delayMs = retryDelaysMs[delayIndex];
    const routingKey = retryRoutingKey(metadata.type, metadata.attempt);

    const options: PublishOptionsInterna = {
      persistent: true,
      messageId: metadata.id,
      correlationId: metadata.correlationId,
      headers: {
        [ATTEMPT_HEADER]: metadata.attempt + 1,
        [TYPE_HEADER]: metadata.type,
      },
      timeout: PUBLISH_TIMEOUT_MS,
    };

    await this.amqp.publish(RETRY_EXCHANGE, routingKey, envelope, options);

    return delayMs;
  }

  private async sendToFailedQueue<T>(
    envelope: JobEnvelope<T>,
    metadata: JobMetadata,
    error: unknown,
  ): Promise<void> {
    const routingKey = failedRoutingKey(metadata.type);

    const options: PublishOptionsInterna = {
      persistent: true,
      messageId: metadata.id,
      correlationId: metadata.correlationId,
      headers: {
        [ATTEMPT_HEADER]: metadata.attempt,
        [TYPE_HEADER]: metadata.type,
        [ERROR_HEADER]: this.getErrorMessage(error).slice(
          0,
          MAX_LENGTH_MENSAJE_ERROR,
        ),
        [ERROR_CLASS_HEADER]: this.getErrorClass(error),
      },
      timeout: PUBLISH_TIMEOUT_MS,
    };

    await this.amqp.publish(FAILED_EXCHANGE, routingKey, envelope, options);
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private getErrorClass(error: unknown): string {
    return error instanceof Error ? error.constructor.name : 'Unknown';
  }
}
