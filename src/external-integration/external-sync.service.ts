import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ActivityPlace } from '../activities/entities/activity-place.entity';
import { GOOGLE_MAPS_PROVIDER_KEY } from '../database/seeds/definitions';
import { PermanentJobError } from '../messaging/errors/permanent-job-error';
import { RetryableJobError } from '../messaging/errors/retryable-job-error';
import { ExternalSync } from './entities/external-sync.entity';
import { ExternalDataUsageService } from './external-data-usage.service';
import { EXTERNAL_SYNC_STATUS } from './external-sync-status';
import {
  GoogleMapsClientService,
  GoogleMapsProviderError,
} from './google-maps/google-maps-client.service';
import { ResolvedPlaceDto } from './google-maps/dto/resolved-place.dto';

const BATCH_SIZE = 200;

const EXTERNAL_SYNC_USAGE_CONTEXT = 'external-sync';

@Injectable()
export class ExternalSyncService {
  private readonly logger = new Logger(ExternalSyncService.name);

  constructor(
    @InjectRepository(ExternalSync)
    private readonly externalSyncRepository: Repository<ExternalSync>,
    @InjectRepository(ActivityPlace)
    private readonly activityPlaceRepository: Repository<ActivityPlace>,
    private readonly googleMaps: GoogleMapsClientService,
    private readonly externalDataUsage: ExternalDataUsageService,
  ) {}

  async run(externalSyncId: number): Promise<void> {
    let processed = 0;
    let unresolved = 0;
    let transientFailures = 0;
    let permanentFailures = 0;
    let rateLimited = false;
    let offset = 0;

    while (!rateLimited) {
      const rows = await this.activityPlaceRepository.find({
        where: { deletedAt: IsNull() },
        relations: { place: true },
        order: { id: 'ASC' },
        skip: offset,
        take: BATCH_SIZE,
      });

      if (rows.length === 0) {
        break;
      }

      for (const row of rows) {
        if (!row.place) {
          // The related place was soft-deleted: there is no address to look up.
          unresolved += 1;
          continue;
        }

        try {
          if (row.googlePlaceId === null) {
            const result = await this.googleMaps.searchPlace(row.place.address);
            row.googlePlaceId = result.placeId;
            row.latitude = result.latitude;
            row.longitude = result.longitude;
            this.applyExternalRating(row, result);
          } else {
            const result = await this.googleMaps.getPlaceDetails(
              row.googlePlaceId,
            );
            row.latitude = result.latitude;
            row.longitude = result.longitude;
            this.applyExternalRating(row, result);
          }

          await this.activityPlaceRepository.save(row);
          await this.recordUsage(row);
          processed += 1;
        } catch (error) {
          if (!(error instanceof GoogleMapsProviderError)) {
            throw error;
          }

          if (error.reason === 'not_found') {
            if (row.googlePlaceId === null) {
              // The row was never linked to Google: the search simply could
              // not match the address, so nothing went missing at the source.
              // Existing coordinates stay untouched.
              unresolved += 1;
              this.logger.warn(
                `No Google match for activity_place ${row.id} ("${row.place.address}"); leaving its current data untouched.`,
              );
            } else {
              this.applyMissingAtSource(row);
              await this.activityPlaceRepository.save(row);
              processed += 1;
            }
          } else if (error.reason === 'rate_limited') {
            // Stop the pass immediately: continuing would keep hammering a
            // provider that is already throttling us.
            transientFailures += 1;
            rateLimited = true;
            this.logger.warn(
              `Google Maps rate limit reached during external sync ${externalSyncId}; stopping this pass after ${processed} record(s).`,
            );
            break;
          } else if (error.reason === 'unavailable') {
            transientFailures += 1;
          } else {
            permanentFailures += 1;
          }
        }
      }

      if (rows.length < BATCH_SIZE) {
        break;
      }

      offset += rows.length;
    }

    await this.externalSyncRepository.update(externalSyncId, {
      recordCount: processed,
    });

    if (unresolved > 0) {
      this.logger.log(
        `External sync ${externalSyncId}: ${unresolved} record(s) could not be resolved against Google and were left unchanged.`,
      );
    }

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

  private applyMissingAtSource(row: ActivityPlace): void {
    row.latitude = null;
    row.longitude = null;
    row.externalRating = null;
    row.externalRatingCount = null;
  }

  private async recordUsage(row: ActivityPlace): Promise<void> {
    if (row.googlePlaceId === null) {
      return;
    }

    try {
      await this.externalDataUsage.record(
        GOOGLE_MAPS_PROVIDER_KEY,
        row.googlePlaceId,
        EXTERNAL_SYNC_USAGE_CONTEXT,
      );
    } catch (error) {
      // The audit trail must never abort a sync that already succeeded.
      this.logger.warn(
        `Could not record external data usage for activity_place ${row.id}: ${this.getErrorMessage(error)}`,
      );
    }
  }

  private applyExternalRating(
    row: ActivityPlace,
    result: ResolvedPlaceDto,
  ): void {
    if (result.rating === undefined || result.ratingCount === undefined) {
      row.externalRating = null;
      row.externalRatingCount = null;
      return;
    }

    row.externalRating = result.rating;
    row.externalRatingCount = result.ratingCount;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
