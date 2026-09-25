import { Injectable } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import type { ConsumeMessage } from 'amqplib';
import {
  EXAMPLE_QUEUE,
  JOBS_EXCHANGE,
  EXAMPLE_ROUTING_KEY,
} from '../../constants';
import { PermanentJobError } from '../../errors/permanent-job-error';
import { RetryableJobError } from '../../errors/retryable-job-error';
import type { ExamplePayload } from '../../types/job-type';
import type { JobEnvelope } from '../../types/job-envelope';
import { JobProcessorService } from '../job-processor.service';

@Injectable()
export class ExampleHandler {
  constructor(private readonly processor: JobProcessorService) {}

  @RabbitSubscribe({
    exchange: JOBS_EXCHANGE,
    routingKey: EXAMPLE_ROUTING_KEY,
    queue: EXAMPLE_QUEUE,
    createQueueIfNotExists: false,
  })
  async handle(
    envelope: JobEnvelope<ExamplePayload>,
    amqpMsg: ConsumeMessage,
  ): Promise<void> {
    return this.processor.process(envelope, amqpMsg, (s) => this.execute(s));
  }

  private async execute(envelope: JobEnvelope<ExamplePayload>): Promise<void> {
    const { simulatedFailure } = envelope.payload;

    if (simulatedFailure === 'retryable') {
      throw new RetryableJobError(
        'Simulated retryable failure (example job, F12)',
      );
    }

    if (simulatedFailure === 'permanent') {
      throw new PermanentJobError(
        'Simulated permanent failure (example job, F12)',
      );
    }

    await Promise.resolve();
  }
}
