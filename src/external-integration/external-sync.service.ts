import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import { ActivityPlace } from '../activities/entities/activity-place.entity';
import { Place } from '../places/entities/place.entity';
import { GOOGLE_CACHE_TTL_DAYS } from '../catalog/catalog.constants';
import { GOOGLE_MAPS_PROVIDER_KEY } from '../database/seeds/definitions';
import { PermanentJobError } from '../messaging/errors/permanent-job-error';
import { RetryableJobError } from '../messaging/errors/retryable-job-error';
import { ExternalSync } from './entities/external-sync.entity';
import { ExternalDataUsageService } from './external-data-usage.service';
import {
  applyProviderContent,
  dropProviderContent,
  syncLinkCoordinates,
} from './google-cache';
import { EXTERNAL_SYNC_STATUS } from './external-sync-status';
import {
  estimateGoogleCost,
  GOOGLE_BUDGET_CONTEXTS,
  GoogleBudgetTracker,
  spentThisMonthUsd,
  type GoogleCostEstimate,
} from './google-cost';
import {
  GoogleMapsClientService,
  GoogleMapsProviderError,
} from './google-maps/google-maps-client.service';

const BATCH_SIZE = 200;

const EXTERNAL_SYNC_USAGE_CONTEXT = 'external-sync';
const EXTERNAL_SYNC_SEARCH_USAGE_CONTEXT = 'external-sync-search';

/**
 * Enriches `place` rows with a Google `place_id` and a TEMPORARY cache of
 * Google coordinates, rating, place-level price and business status, then
 * copies the effective coordinates to the place's activity links. One
 * physical place costs one lookup however many activities happen there.
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
    @InjectRepository(Place)
    private readonly placeRepository: Repository<Place>,
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

    const budget = await GoogleBudgetTracker.create(
      this.externalDataUsage,
      this.monthlyBudgetUsd(),
    );

    while (!stoppedEarly) {
      const rows = await this.placeRepository.find({
        where: { deletedAt: IsNull() },
        relations: { department: true },
        order: { id: 'ASC' },
        skip: offset,
        take: BATCH_SIZE,
      });

      if (rows.length === 0) {
        break;
      }

      for (const row of rows) {
        if (
          !budget.tryCharge(
            row.googlePlaceId === null ? 'textSearch' : 'placeDetails',
          )
        ) {
          this.logger.warn(
            `External sync ${externalSyncId}: monthly Google budget reached; stopping this pass after ${processed} record(s).`,
          );
          stoppedEarly = true;
          break;
        }

        const wasLinked = row.googlePlaceId !== null;
        try {
          const now = new Date();
          if (row.googlePlaceId === null) {
            const result = await this.googleMaps.searchPlace(
              [row.name, row.address, row.department?.name]
                .filter(Boolean)
                .join(', '),
            );
            row.googlePlaceId = result.placeId;
            applyProviderContent(row, result, now, this.ttlDays());
          } else {
            const result = await this.googleMaps.getPlaceDetails(
              row.googlePlaceId,
            );
            applyProviderContent(row, result, now, this.ttlDays());
          }

          await this.placeRepository.save(row);
          await this.syncLinks(row);
          await this.recordUsage(row, wasLinked);
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
                `No Google match for place ${row.id} ("${row.address}"); leaving its current data untouched.`,
              );
            } else {
              dropProviderContent(row);
              await this.placeRepository.save(row);
              await this.syncLinks(row);
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
      this.placeRepository.count({ where: { deletedAt: IsNull() } }),
      this.placeRepository.count({
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
   * Removes cached Google content whose expiry passed, from places and from
   * the coordinates their links copied. SmartPlan-owned coordinates are never
   * touched; the Place ID stays (it is allowed).
   */
  async purgeExpiredCache(now: Date = new Date()): Promise<number> {
    const expired = await this.placeRepository.find({
      where: { externalExpiresAt: LessThan(now) },
    });
    for (const row of expired) {
      dropProviderContent(row);
    }
    if (expired.length > 0) {
      await this.placeRepository.save(expired);
    }
    const links = await this.activityPlaceRepository.find({
      where: { externalExpiresAt: LessThan(now) },
    });
    for (const link of links) {
      link.latitude = null;
      link.longitude = null;
      link.coordinatesSource = null;
      link.externalFetchedAt = null;
      link.externalExpiresAt = null;
    }
    if (links.length > 0) {
      await this.activityPlaceRepository.save(links);
    }
    return expired.length + links.length;
  }

  private async syncLinks(place: Place): Promise<void> {
    const links = await this.activityPlaceRepository.find({
      where: { idPlace: place.id, deletedAt: IsNull() },
    });
    const changed = links.filter((link) => syncLinkCoordinates(link, place));
    if (changed.length > 0) await this.activityPlaceRepository.save(changed);
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

  /** Budget left this calendar month, from the recorded usage per SKU. */
  private async remainingBudgetUsd(): Promise<number> {
    const spent = await spentThisMonthUsd(this.externalDataUsage, [
      ...GOOGLE_BUDGET_CONTEXTS,
    ]);
    return Math.max(0, this.monthlyBudgetUsd() - spent);
  }

  private async recordUsage(row: Place, wasLinked: boolean): Promise<void> {
    if (row.googlePlaceId === null) {
      return;
    }

    try {
      await this.externalDataUsage.record(
        GOOGLE_MAPS_PROVIDER_KEY,
        row.googlePlaceId,
        wasLinked
          ? EXTERNAL_SYNC_USAGE_CONTEXT
          : EXTERNAL_SYNC_SEARCH_USAGE_CONTEXT,
      );
    } catch (error) {
      // The audit trail must never abort a sync that already succeeded.
      this.logger.warn(
        `Could not record external data usage for place ${row.id}: ${this.getErrorMessage(error)}`,
      );
    }
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
