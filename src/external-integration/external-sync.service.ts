import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import { ActivityPlace } from '../activities/entities/activity-place.entity';
import { GOOGLE_CACHE_TTL_DAYS } from '../catalog/catalog.constants';
import { GOOGLE_MAPS_PROVIDER_KEY } from '../database/seeds/definitions';
import { PermanentJobError } from '../messaging/errors/permanent-job-error';
import { RetryableJobError } from '../messaging/errors/retryable-job-error';
import { ExternalSync } from './entities/external-sync.entity';
import { ExternalDataUsageService } from './external-data-usage.service';
import { EXTERNAL_SYNC_STATUS } from './external-sync-status';
import {
  estimateGoogleCost,
  GOOGLE_UNIT_COST_USD,
  startOfBudgetMonth,
  type GoogleCostEstimate,
} from './google-cost';
import {
  GoogleMapsClientService,
  GoogleMapsProviderError,
} from './google-maps/google-maps-client.service';
import { ResolvedPlaceDto } from './google-maps/dto/resolved-place.dto';

const BATCH_SIZE = 200;

const EXTERNAL_SYNC_USAGE_CONTEXT = 'external-sync';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Enriches `activity_place` rows with a Google `place_id` and a TEMPORARY
 * cache of Google coordinates and rating.
 *
 * Provider terms allow persisting only the Place ID. Everything else fetched
 * here is a cache with an expiry (GOOGLE_CACHE_TTL_DAYS, at most 30 days):
 * - it is stamped `coordinates_source = GOOGLE_CACHE` and `external_expires_at`;
 * - it never overwrites SmartPlan-owned (admin/curated) coordinates;
 * - it is purged when it expires;
 * - it is never part of the catalog export or a version package.
 */
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
    @Optional() private readonly configuration?: ConfigService,
  ) {}

  async run(externalSyncId: number): Promise<void> {
    let processed = 0;
    let unresolved = 0;
    let transientFailures = 0;
    let permanentFailures = 0;
    let stoppedEarly = false;
    let offset = 0;

    const budget = await this.remainingBudgetUsd();
    let remainingBudgetUsd = budget;

    while (!stoppedEarly) {
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

        const unitCost =
          row.googlePlaceId === null
            ? GOOGLE_UNIT_COST_USD.textSearch
            : GOOGLE_UNIT_COST_USD.placeDetails;
        if (remainingBudgetUsd < unitCost) {
          this.logger.warn(
            `External sync ${externalSyncId}: monthly Google budget reached; stopping this pass after ${processed} record(s).`,
          );
          stoppedEarly = true;
          break;
        }
        remainingBudgetUsd -= unitCost;

        try {
          const now = new Date();
          if (row.googlePlaceId === null) {
            const result = await this.googleMaps.searchPlace(row.place.address);
            row.googlePlaceId = result.placeId;
            this.cacheProviderContent(row, result, now);
          } else {
            const result = await this.googleMaps.getPlaceDetails(
              row.googlePlaceId,
            );
            this.cacheProviderContent(row, result, now);
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
              this.dropCachedProviderContent(row);
              await this.activityPlaceRepository.save(row);
              processed += 1;
            }
          } else if (error.reason === 'disabled') {
            // Kill switch: stop quietly, nothing was spent.
            this.logger.warn(
              `Google Maps calls are disabled; stopping external sync ${externalSyncId}.`,
            );
            stoppedEarly = true;
            break;
          } else if (error.reason === 'rate_limited') {
            // Stop the pass immediately: continuing would keep hammering a
            // provider that is already throttling us.
            transientFailures += 1;
            stoppedEarly = true;
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

  /**
   * What a full pass would cost, without calling Google. Used before any bulk
   * run: if it does not fit the monthly budget the paid pass is not started.
   */
  async estimatePass(): Promise<
    GoogleCostEstimate & {
      textSearches: number;
      placeDetails: number;
      monthlyBudgetUsd: number;
      remainingBudgetUsd: number;
      fitsBudget: boolean;
    }
  > {
    const [total, unlinked] = await Promise.all([
      this.activityPlaceRepository.count({ where: { deletedAt: IsNull() } }),
      this.activityPlaceRepository.count({
        where: { deletedAt: IsNull(), googlePlaceId: IsNull() },
      }),
    ]);
    const placeDetails = Math.max(0, total - unlinked);
    const estimate = estimateGoogleCost({
      textSearches: unlinked,
      placeDetails,
    });
    const remaining = await this.remainingBudgetUsd();
    return {
      ...estimate,
      textSearches: unlinked,
      placeDetails,
      monthlyBudgetUsd: this.monthlyBudgetUsd(),
      remainingBudgetUsd: remaining,
      fitsBudget: estimate.costUsd <= remaining,
    };
  }

  /**
   * Removes cached Google content whose expiry passed. SmartPlan-owned
   * coordinates are never touched; the Place ID stays (it is allowed).
   */
  async purgeExpiredCache(now: Date = new Date()): Promise<number> {
    const expired = await this.activityPlaceRepository.find({
      where: { externalExpiresAt: LessThan(now) },
    });
    for (const row of expired) {
      this.dropCachedProviderContent(row);
    }
    if (expired.length > 0) {
      await this.activityPlaceRepository.save(expired);
    }
    return expired.length;
  }

  async markFailed(externalSyncId: number, error: unknown): Promise<void> {
    await this.externalSyncRepository.update(externalSyncId, {
      status: EXTERNAL_SYNC_STATUS.FAILED,
      endedAt: new Date(),
      errorMessage: this.getErrorMessage(error),
    });
  }

  private ttlDays(): number {
    const configured = this.configuration?.get<number>('GOOGLE_CACHE_TTL_DAYS');
    return Math.min(30, configured ?? GOOGLE_CACHE_TTL_DAYS);
  }

  private monthlyBudgetUsd(): number {
    return (
      this.configuration?.get<number>('GOOGLE_CATALOG_MONTHLY_BUDGET_USD') ?? 25
    );
  }

  /** Budget left this calendar month, from the recorded sync usage. */
  private async remainingBudgetUsd(): Promise<number> {
    const used = await this.externalDataUsage.countSince(
      [EXTERNAL_SYNC_USAGE_CONTEXT],
      startOfBudgetMonth(),
    );
    // Each recorded sync call is counted at the dearer of the two unit costs.
    const spent = used * GOOGLE_UNIT_COST_USD.textSearch;
    return Math.max(0, this.monthlyBudgetUsd() - spent);
  }

  /**
   * Stores a provider result as a temporary cache. SmartPlan-owned coordinates
   * are kept: Google never overwrites what we are allowed to persist.
   */
  private cacheProviderContent(
    row: ActivityPlace,
    result: ResolvedPlaceDto,
    now: Date,
  ): void {
    const hasOwnedCoordinates =
      row.latitude !== null &&
      row.longitude !== null &&
      row.coordinatesSource !== 'GOOGLE_CACHE';

    if (!hasOwnedCoordinates) {
      row.latitude = result.latitude;
      row.longitude = result.longitude;
      row.coordinatesSource = 'GOOGLE_CACHE';
    }

    this.applyExternalRating(row, result);
    row.externalFetchedAt = now;
    row.externalExpiresAt = new Date(now.getTime() + this.ttlDays() * DAY_MS);
  }

  /** The provider no longer has the place, or the cache expired. */
  private dropCachedProviderContent(row: ActivityPlace): void {
    if (row.coordinatesSource === 'GOOGLE_CACHE') {
      row.latitude = null;
      row.longitude = null;
      row.coordinatesSource = null;
    }
    row.externalRating = null;
    row.externalRatingCount = null;
    row.externalFetchedAt = null;
    row.externalExpiresAt = null;
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
