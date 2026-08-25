import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ActivityPlace } from '../activities/entities/activity-place.entity';
import { PermanentJobError } from '../messaging/errors/permanent-job-error';
import { RetryableJobError } from '../messaging/errors/retryable-job-error';
import { ExternalSync } from './entities/external-sync.entity';
import { EXTERNAL_SYNC_STATUS } from './external-sync-status';
import {
  GoogleMapsClientService,
  GoogleMapsProviderError,
} from './google-maps/google-maps-client.service';

@Injectable()
export class ExternalSyncService {
  constructor(
    @InjectRepository(ExternalSync)
    private readonly externalSyncRepository: Repository<ExternalSync>,
    @InjectRepository(ActivityPlace)
    private readonly activityPlaceRepository: Repository<ActivityPlace>,
    private readonly googleMaps: GoogleMapsClientService,
  ) {}

  async run(externalSyncId: number): Promise<void> {
    const rows = await this.activityPlaceRepository.find({
      where: { deletedAt: IsNull() },
      relations: { place: true },
    });

    let processed = 0;
    let transientFailures = 0;
    let permanentFailures = 0;

    for (const row of rows) {
      try {
        if (row.googlePlaceId === null) {
          const result = await this.googleMaps.searchPlace(row.place.address);
          row.googlePlaceId = result.placeId;
          row.latitude = result.latitude;
          row.longitude = result.longitude;
          row.externalRating = result.rating ?? null;
          row.externalRatingCount = result.ratingCount ?? null;
        } else {
          const result = await this.googleMaps.getPlaceDetails(
            row.googlePlaceId,
          );
          row.latitude = result.latitude;
          row.longitude = result.longitude;
          row.externalRating = result.rating ?? null;
          row.externalRatingCount = result.ratingCount ?? null;
        }

        await this.activityPlaceRepository.save(row);
        processed += 1;
      } catch (error) {
        if (!(error instanceof GoogleMapsProviderError)) {
          throw error;
        }

        if (error.reason === 'not_found') {
          row.latitude = null;
          row.longitude = null;
          row.externalRating = null;
          row.externalRatingCount = null;
          await this.activityPlaceRepository.save(row);
          processed += 1;
        } else if (
          error.reason === 'rate_limited' ||
          error.reason === 'unavailable'
        ) {
          transientFailures += 1;
        } else {
          permanentFailures += 1;
        }
      }
    }

    await this.externalSyncRepository.update(externalSyncId, {
      recordCount: processed,
    });

    if (permanentFailures > 0) {
      throw new PermanentJobError(
        `${permanentFailures} record(s) failed permanently during external sync.`,
      );
    }

    if (transientFailures > 0) {
      throw new RetryableJobError(
        `${transientFailures} record(s) failed transiently during external sync.`,
      );
    }

    await this.externalSyncRepository.update(externalSyncId, {
      status: EXTERNAL_SYNC_STATUS.COMPLETED,
      endedAt: new Date(),
    });
  }

  async markFailed(externalSyncId: number, error: unknown): Promise<void> {
    await this.externalSyncRepository.update(externalSyncId, {
      status: EXTERNAL_SYNC_STATUS.FAILED,
      endedAt: new Date(),
      errorMessage: this.getErrorMessage(error),
    });
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
