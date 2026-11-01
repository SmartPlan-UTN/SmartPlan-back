import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import type { ConsumeMessage } from 'amqplib';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CatalogRefreshService } from '../../../catalog/refresh/catalog-refresh.service';
import { ExternalSync } from '../../../external-integration/entities/external-sync.entity';
import { EXTERNAL_SYNC_STATUS } from '../../../external-integration/external-sync-status';
import {
  CATALOG_REFRESH_QUEUE,
  CATALOG_REFRESH_ROUTING_KEY,
  JOBS_EXCHANGE,
} from '../../constants';
import { PermanentJobError } from '../../errors/permanent-job-error';
import type { CatalogRefreshPayload } from '../../types/job-type';
import type { JobEnvelope } from '../../types/job-envelope';
import { JobProcessorService } from '../job-processor.service';

/**
 * Runs the monthly catalog refresh (RF43, RF44, CU49-CU51). A failing
 * Gemini step is recorded inside the run and does not fail the job; only
 * an unexpected error marks the run failed, and it is never retried: a
 * retry would pay for the same discovery twice.
 */
@Injectable()
export class CatalogRefreshHandler {
  private readonly logger = new Logger(CatalogRefreshHandler.name);

  constructor(
    private readonly processor: JobProcessorService,
    private readonly refresh: CatalogRefreshService,
    @InjectRepository(ExternalSync)
    private readonly syncs: Repository<ExternalSync>,
  ) {}

  @RabbitSubscribe({
    exchange: JOBS_EXCHANGE,
    routingKey: CATALOG_REFRESH_ROUTING_KEY,
    queue: CATALOG_REFRESH_QUEUE,
    createQueueIfNotExists: false,
  })
  async handle(
    envelope: JobEnvelope<CatalogRefreshPayload>,
    amqpMsg: ConsumeMessage,
  ): Promise<void> {
    return this.processor.process(envelope, amqpMsg, (job) =>
      this.execute(job),
    );
  }

  private async execute(
    envelope: JobEnvelope<CatalogRefreshPayload>,
  ): Promise<void> {
    const { externalSyncId } = envelope.payload;
    // A redelivered message for a finished run is acknowledged, not replayed.
    const sync = await this.syncs.findOne({ where: { id: externalSyncId } });
    if (!sync || sync.status !== EXTERNAL_SYNC_STATUS.RUNNING) return;
    try {
      const details = await this.refresh.run(externalSyncId);
      this.logger.log({
        event: 'catalog_refresh_completed',
        externalSyncId,
        created: details.candidates.created,
        geminiCalls: details.geminiCalls,
        capped: details.capped,
        errors: details.errors.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.syncs.update(externalSyncId, {
        status: EXTERNAL_SYNC_STATUS.FAILED,
        endedAt: new Date(),
        errorMessage: message.slice(0, 2000),
      });
      throw new PermanentJobError(message, error);
    }
  }
}
