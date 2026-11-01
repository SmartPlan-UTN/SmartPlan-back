import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { EnvironmentVariables } from '../../config/environment-variables';
import { GEMINI_PROVIDER_KEY } from '../../database/seeds/definitions';
import { ExternalProvider } from '../../external-integration/entities/external-provider.entity';
import { ExternalSync } from '../../external-integration/entities/external-sync.entity';
import { EXTERNAL_SYNC_STATUS } from '../../external-integration/external-sync-status';
import { MessagingService } from '../../messaging/messaging.service';
import { JobType } from '../../messaging/types/job-type';
import { periodOf } from './catalog-refresh.service';
import { admitCatalogRefresh } from './catalog-refresh-admission';

/**
 * Starts the monthly catalog refresh (RF43, CU49) on the 1st at 05:00 in
 * Mendoza, after the daily 03:00 Google sync. Off unless
 * CATALOG_REFRESH_SCHEDULER_ENABLED; at most one completed run per period
 * and never two at once. The worker does the work (catalog-refresh.handler).
 */
@Injectable()
export class CatalogRefreshScheduler {
  private readonly logger = new Logger(CatalogRefreshScheduler.name);

  constructor(
    @InjectRepository(ExternalProvider)
    private readonly providers: Repository<ExternalProvider>,
    @InjectRepository(ExternalSync)
    private readonly syncs: Repository<ExternalSync>,
    private readonly messaging: MessagingService,
    private readonly configuration: ConfigService<EnvironmentVariables, true>,
  ) {}

  @Cron('0 5 1 * *', { timeZone: 'America/Argentina/Mendoza' })
  async triggerRefresh(): Promise<void> {
    if (
      this.configuration.get('CATALOG_REFRESH_SCHEDULER_ENABLED', {
        infer: true,
      }) !== true
    )
      return;
    try {
      await this.run();
    } catch (error) {
      this.logger.error(
        'The monthly catalog refresh could not be started.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Creates the run for `period` and queues it; `null` when nothing to do. */
  async run(now: Date = new Date()): Promise<number | null> {
    const period = periodOf(now);
    const provider = await this.providers.findOneOrFail({
      where: { key: GEMINI_PROVIDER_KEY },
    });
    const sync = await admitCatalogRefresh(
      this.syncs,
      provider.id,
      period,
      now,
    );
    if (!sync) return null;
    try {
      await this.messaging.publish(JobType.RefreshCatalog, {
        externalSyncId: sync.id,
      });
    } catch (error) {
      await this.syncs.update(sync.id, {
        status: EXTERNAL_SYNC_STATUS.FAILED,
        endedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    return sync.id;
  }
}
