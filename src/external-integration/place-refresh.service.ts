import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityPlace } from '../activities/entities/activity-place.entity';
import { GOOGLE_CACHE_TTL_DAYS } from '../catalog/catalog.constants';
import { GOOGLE_MAPS_PROVIDER_KEY } from '../database/seeds/definitions';
import { ExternalDataUsageService } from './external-data-usage.service';
import {
  applyProviderContent,
  dropProviderContent,
  isProviderCacheStale,
} from './google-cache';
import {
  GOOGLE_BUDGET_CONTEXTS,
  GOOGLE_UNIT_COST_USD,
  startOfBudgetMonth,
} from './google-cost';
import {
  GoogleMapsClientService,
  GoogleMapsProviderError,
} from './google-maps/google-maps-client.service';

export const PLACE_REFRESH_USAGE_CONTEXT = 'place-refresh';

/** Links refreshed per call: a person opening one activity, not a sweep. */
const MAX_REFRESHES_PER_CALL = 3;
/** The same Place ID is not retried sooner than this, even on failure. */
const RETRY_AFTER_MS = 15 * 60 * 1000;

/**
 * On-demand refresh of the TEMPORARY Google cache for the places of an
 * activity somebody is looking at, so an expired cache does not leave the
 * screen without a rating or place-level price until the next nightly pass.
 *
 * Bounded by the same guards as every other paid path: the GOOGLE_PLACES_ENABLED
 * kill switch (in the client), the request-rate limiter, and the shared monthly
 * budget. It never throws to the caller: the page renders with whatever is
 * cached.
 */
@Injectable()
export class PlaceRefreshService {
  private readonly logger = new Logger(PlaceRefreshService.name);
  private readonly lastAttempt = new Map<string, number>();

  constructor(
    @InjectRepository(ActivityPlace)
    private readonly activityPlaces: Repository<ActivityPlace>,
    private readonly googleMaps: GoogleMapsClientService,
    private readonly usage: ExternalDataUsageService,
    @Optional() private readonly configuration?: ConfigService,
  ) {}

  /** Refreshes stale links in place; returns how many were refreshed. */
  async refreshStale(
    links: ActivityPlace[],
    now: Date = new Date(),
  ): Promise<number> {
    const candidates = links
      .filter(
        (link) =>
          link.googlePlaceId !== null &&
          isProviderCacheStale(link, now) &&
          !this.recentlyAttempted(link.googlePlaceId, now),
      )
      .slice(0, MAX_REFRESHES_PER_CALL);
    if (candidates.length === 0) return 0;

    let remaining: number;
    try {
      remaining = await this.remainingBudgetUsd(now);
    } catch (error) {
      this.logger.warn(`Place refresh skipped: ${this.message(error)}`);
      return 0;
    }

    let refreshed = 0;
    for (const link of candidates) {
      const placeId = link.googlePlaceId as string;
      if (remaining < GOOGLE_UNIT_COST_USD.placeDetails) break;
      remaining -= GOOGLE_UNIT_COST_USD.placeDetails;
      this.lastAttempt.set(placeId, now.getTime());

      try {
        const result = await this.googleMaps.getPlaceDetails(placeId);
        applyProviderContent(link, result, now, this.ttlDays());
        await this.activityPlaces.save(link);
        await this.recordUsage(placeId);
        refreshed += 1;
      } catch (error) {
        if (error instanceof GoogleMapsProviderError) {
          if (error.reason === 'not_found') {
            dropProviderContent(link);
            await this.activityPlaces.save(link);
          } else if (error.reason === 'disabled') {
            break;
          }
          // rate_limited / unavailable / provider_error: keep what is cached.
          continue;
        }
        this.logger.warn(
          `Place refresh failed for ${placeId}: ${this.message(error)}`,
        );
      }
    }
    return refreshed;
  }

  private recentlyAttempted(placeId: string, now: Date): boolean {
    const last = this.lastAttempt.get(placeId);
    if (last === undefined) return false;
    if (now.getTime() - last >= RETRY_AFTER_MS) {
      this.lastAttempt.delete(placeId);
      return false;
    }
    return true;
  }

  private ttlDays(): number {
    return Math.min(
      30,
      this.configuration?.get<number>('GOOGLE_CACHE_TTL_DAYS') ??
        GOOGLE_CACHE_TTL_DAYS,
    );
  }

  private async remainingBudgetUsd(now: Date): Promise<number> {
    const budget =
      this.configuration?.get<number>('GOOGLE_CATALOG_MONTHLY_BUDGET_USD') ??
      25;
    const used = await this.usage.countSince(
      [...GOOGLE_BUDGET_CONTEXTS],
      startOfBudgetMonth(now),
    );
    return Math.max(0, budget - used * GOOGLE_UNIT_COST_USD.textSearch);
  }

  private async recordUsage(placeId: string): Promise<void> {
    try {
      await this.usage.record(
        GOOGLE_MAPS_PROVIDER_KEY,
        placeId,
        PLACE_REFRESH_USAGE_CONTEXT,
      );
    } catch (error) {
      this.logger.warn(
        `Could not record place refresh usage: ${this.message(error)}`,
      );
    }
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
