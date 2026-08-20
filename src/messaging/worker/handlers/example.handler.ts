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

/**
 * Job de ejemplo (F12): demuestra el flujo completo producer → RabbitMQ →
 * worker → handler → ack, y el camino de fallo → reattempt → DLQ vía el
 * field `payload.fallaSimulada`. Trivial a propósito — sin lógica de
 * negocio real, sin integraciones externas.
 */
@Injectable()
export class ExampleHandler {
  constructor(private readonly processor: JobProcessorService) {}

  @RabbitSubscribe({
    exchange: JOBS_EXCHANGE,
    routingKey: EXAMPLE_ROUTING_KEY,
    queue: EXAMPLE_QUEUE,
    // La queue la declara messaging.config.ts — no redeclarar acá evita el
    // PRECONDITION_FAILED que dispara golevelup si dos declaraciones de la
    // misma queue difieren en options.
    createQueueIfNotExists: false,
  })
  async manejar(
    envelope: JobEnvelope<ExamplePayload>,
    amqpMsg: ConsumeMessage,
  ): Promise<void> {
    return this.processor.process(envelope, amqpMsg, (s) => this.execute(s));
  }

  private async execute(envelope: JobEnvelope<ExamplePayload>): Promise<void> {
    const { fallaSimulada } = envelope.payload;

    if (fallaSimulada === 'reintentable') {
      throw new RetryableJobError(
        'Falla simulada reintentable (job de ejemplo, F12)',
      );
    }

    if (fallaSimulada === 'permanente') {
      throw new PermanentJobError(
        'Falla simulada permanente (job de ejemplo, F12)',
      );
    }

    // Trabajo real, trivial a propósito.
    await Promise.resolve();
  }
}
