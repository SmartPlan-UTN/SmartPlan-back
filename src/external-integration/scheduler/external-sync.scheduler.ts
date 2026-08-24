import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { GOOGLE_MAPS_PROVIDER_KEY } from '../../database/seeds/definitions';
import { MessagingService } from '../../messaging/messaging.service';
import { JobType } from '../../messaging/types/job-type';
import { ExternalProvider } from '../entities/external-provider.entity';
import { ExternalSync } from '../entities/external-sync.entity';
import {
  EXTERNAL_SYNC_ENTITY,
  EXTERNAL_SYNC_STATUS,
} from '../external-sync-status';

@Injectable()
export class ExternalSyncScheduler {
  private readonly logger = new Logger(ExternalSyncScheduler.name);

  constructor(
    @InjectRepository(ExternalProvider)
    private readonly externalProviderRepository: Repository<ExternalProvider>,
    @InjectRepository(ExternalSync)
    private readonly externalSyncRepository: Repository<ExternalSync>,
    private readonly messaging: MessagingService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async triggerSync(): Promise<void> {
    await this.run();
  }

  async run(): Promise<void> {
    const provider = await this.externalProviderRepository.findOneOrFail({
      where: { key: GOOGLE_MAPS_PROVIDER_KEY },
    });

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

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
