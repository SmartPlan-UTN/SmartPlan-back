import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ActivityPlace } from '../activities/entities/activity-place.entity';
import { Place } from '../places/entities/place.entity';
import { GOOGLE_CACHE_TTL_DAYS } from '../catalog/catalog.constants';
import { GOOGLE_MAPS_PROVIDER_KEY } from '../database/seeds/definitions';
import { ExternalDataUsageService } from './external-data-usage.service';
import {
  applyProviderContent,
  dropProviderContent,
  isProviderCacheStale,
  syncLinkCoordinates,
} from './google-cache';
import {
  GOOGLE_BUDGET_CONTEXTS,
  GOOGLE_UNIT_COST_USD,
  spentThisMonthUsd,
} from './google-cost';
import {
  GoogleMapsClientService,
  GoogleMapsProviderError,
} from './google-maps/google-maps-client.service';

export const PLACE_REFRESH_USAGE_CONTEXT = 'place-refresh';

/** Places refreshed per call: a person opening one screen, not a sweep. */
const MAX_REFRESHES_PER_CALL = 3;
/** The same Place ID is not retried sooner than this, even on failure. */
const RETRY_AFTER_MS = 15 * 60 * 1000;

/**
 * On-demand refresh of the TEMPORARY Google cache of the places somebody is
 * looking at (an activity's places, or one place), so an expired cache does
 * not leave the screen without a rating or place-level price until the next
 * nightly pass.
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
    @InjectRepository(Place)
    private readonly places: Repository<Place>,
    @InjectRepository(ActivityPlace)
    private readonly activityPlaces: Repository<ActivityPlace>,
    private readonly googleMaps: GoogleMapsClientService,
    private readonly usage: ExternalDataUsageService,
    @Optional() private readonly configuration?: ConfigService,
  ) {}

  /**
   * Refreshes stale places in place (and the coordinates their activity links
   * copy from them); returns how many were refreshed.
   */
  async refreshStale(places: Place[], now: Date = new Date()): Promise<number> {
    const seen = new Set<number>();
    const candidates = places
      .filter((place) => {
        if (seen.has(place.id)) return false;
        seen.add(place.id);
        return (
          place.googlePlaceId !== null &&
          isProviderCacheStale(place, now) &&
          !this.recentlyAttempted(place.googlePlaceId, now)
        );
      })
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
    for (const place of candidates) {
      const placeId = place.googlePlaceId as string;
      if (remaining < GOOGLE_UNIT_COST_USD.placeDetails) break;
      remaining -= GOOGLE_UNIT_COST_USD.placeDetails;
      this.lastAttempt.set(placeId, now.getTime());

      try {
        const result = await this.googleMaps.getPlaceDetails(placeId);
        applyProviderContent(place, result, now, this.ttlDays());
        await this.places.save(place);
        await this.syncLinks(place);
        await this.recordUsage(placeId);
        refreshed += 1;
      } catch (error) {
        if (error instanceof GoogleMapsProviderError) {
          if (error.reason === 'not_found') {
            dropProviderContent(place);
            await this.places.save(place);
            await this.syncLinks(place);
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

  private async syncLinks(place: Place): Promise<void> {
    const links = await this.activityPlaces.find({
      where: { idPlace: place.id, deletedAt: IsNull() },
    });
    const changed = links.filter((link) => syncLinkCoordinates(link, place));
    if (changed.length > 0) await this.activityPlaces.save(changed);
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
    const spent = await spentThisMonthUsd(
      this.usage,
      [...GOOGLE_BUDGET_CONTEXTS],
      now,
    );
    return Math.max(0, budget - spent);
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
