import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { GOOGLE_MAPS_PROVIDER_KEY } from '../../database/seeds/definitions';
import { EnvironmentVariables } from '../../config/environment-variables';
import { MessagingService } from '../../messaging/messaging.service';
import { JobType } from '../../messaging/types/job-type';
import { ExternalProvider } from '../entities/external-provider.entity';
import { ExternalSync } from '../entities/external-sync.entity';
import {
  EXTERNAL_SYNC_ENTITY,
  EXTERNAL_SYNC_STATUS,
} from '../external-sync-status';

const STALE_RUN_TIMEOUT_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class ExternalSyncScheduler {
  private readonly logger = new Logger(ExternalSyncScheduler.name);

  constructor(
    @InjectRepository(ExternalProvider)
    private readonly externalProviderRepository: Repository<ExternalProvider>,
    @InjectRepository(ExternalSync)
    private readonly externalSyncRepository: Repository<ExternalSync>,
    private readonly messaging: MessagingService,
    private readonly configuration: ConfigService<EnvironmentVariables, true>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async triggerSync(): Promise<void> {
    if (
      this.configuration.get('EXTERNAL_SYNC_SCHEDULER_ENABLED', {
        infer: true,
      }) === false
    ) {
      return;
    }

    // Nothing awaits a cron callback, so an error escaping here would be
    // swallowed by the scheduler or surface as an unhandled rejection.
    try {
      await this.run();
    } catch (error) {
      this.logger.error(
        'The scheduled external sync could not be started.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async run(): Promise<void> {
    const provider = await this.externalProviderRepository.findOneOrFail({
      where: { key: GOOGLE_MAPS_PROVIDER_KEY },
    });

    if (await this.hasActiveRun(provider.id)) {
      return;
    }

    const externalSync = await this.externalSyncRepository.save(
      this.externalSyncRepository.create({
        idExternalProvider: provider.id,
        entity: EXTERNAL_SYNC_ENTITY,
        status: EXTERNAL_SYNC_STATUS.RUNNING,
        startedAt: new Date(),
      }),
    );

    try {
      await this.messaging.publish(JobType.SyncExternalPlaces, {
        externalSyncId: externalSync.id,
      });
    } catch (error) {
      await this.externalSyncRepository.update(externalSync.id, {
        status: EXTERNAL_SYNC_STATUS.FAILED,
        endedAt: new Date(),
        errorMessage: this.getErrorMessage(error),
      });

      this.logger.error(
        `External sync ${externalSync.id} could not be published.`,
        error instanceof Error ? error.stack : String(error),
      );

      throw error;
    }
  }

  /**
   * Closes runs left behind by a worker that never consumed the job — the
   * broker discards a message nobody is bound to, so `publish` succeeds and the
   * row would otherwise stay `running` forever — and reports whether a genuine
   * run is still in flight, so triggers never overlap.
   */
  private async hasActiveRun(providerId: number): Promise<boolean> {
    const runningRuns = await this.externalSyncRepository.find({
      where: {
        idExternalProvider: providerId,
        entity: EXTERNAL_SYNC_ENTITY,
        status: EXTERNAL_SYNC_STATUS.RUNNING,
      },
    });

    const staleBefore = new Date(Date.now() - STALE_RUN_TIMEOUT_MS);
    let active = false;

    for (const run of runningRuns) {
      if (run.startedAt && run.startedAt.getTime() > staleBefore.getTime()) {
        active = true;
        continue;
      }

      await this.externalSyncRepository.update(run.id, {
        status: EXTERNAL_SYNC_STATUS.FAILED,
        endedAt: new Date(),
        errorMessage:
          'The run exceeded the maximum duration and was closed by the scheduler.',
      });

      this.logger.warn(
        `External sync ${run.id} was stuck in ${EXTERNAL_SYNC_STATUS.RUNNING} and has been marked as failed.`,
      );
    }

    if (active) {
      this.logger.warn(
        'An external sync is still running; skipping this trigger.',
      );
    }

    return active;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
