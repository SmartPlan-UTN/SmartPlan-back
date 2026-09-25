import { HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { GOOGLE_MAPS_PROVIDER_KEY } from '../database/seeds/definitions';
import { GeocodedAddressDto } from './dto/geocoded-address.dto';
import { ExternalDataUsageService } from './external-data-usage.service';
import {
  GoogleMapsClientService,
  GoogleMapsProviderError,
} from './google-maps/google-maps-client.service';
import { ResolvedPlaceDto } from './google-maps/dto/resolved-place.dto';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const CACHE_MAX_ENTRIES = 500;

const EXTERNAL_DATA_USAGE_CONTEXT = {
  PLACES_SEARCH: 'places-search',
  GEOCODE: 'geocode',
} as const;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

@Injectable()
export class PlacesLookupService {
  private readonly cache = new Map<string, CacheEntry<unknown>>();

  constructor(
    private readonly googleMaps: GoogleMapsClientService,
    private readonly externalDataUsage: ExternalDataUsageService,
  ) {}

  async searchPlace(query: string): Promise<ResolvedPlaceDto> {
    const key = `search:${query.toLowerCase()}`;
    try {
      return await this.withCache(key, async () => {
        const place = await this.googleMaps.searchPlace(query);
        await this.externalDataUsage.record(
          GOOGLE_MAPS_PROVIDER_KEY,
          place.placeId,
          EXTERNAL_DATA_USAGE_CONTEXT.PLACES_SEARCH,
        );
        return place;
      });
    } catch (error) {
      throw this.mapProviderError(
        error,
        'PLACE_NOT_FOUND',
        'El lugar solicitado no existe.',
      );
    }
  }

  async geocode(address: string): Promise<GeocodedAddressDto> {
    const key = `geocode:${address.toLowerCase()}`;
    try {
      return await this.withCache(key, async () => {
        const coordinates = await this.googleMaps.geocode(address);
        await this.externalDataUsage.record(
          GOOGLE_MAPS_PROVIDER_KEY,
          `${coordinates.latitude},${coordinates.longitude}`,
          EXTERNAL_DATA_USAGE_CONTEXT.GEOCODE,
        );
        return coordinates;
      });
    } catch (error) {
      throw this.mapProviderError(
        error,
        'ADDRESS_NOT_FOUND',
        'La dirección solicitada no existe.',
      );
    }
  }

  private async withCache<T>(key: string, load: () => Promise<T>): Promise<T> {
    const cached = this.cache.get(key);
    const now = Date.now();

    if (cached) {
      if (cached.expiresAt > now) {
        // Re-insert so the Map's insertion order doubles as recency order.
        this.cache.delete(key);
        this.cache.set(key, cached);
        return cached.value as T;
      }

      this.cache.delete(key);
    }

    const value = await load();
    this.store(key, { value, expiresAt: now + CACHE_TTL_MS });
    return value;
  }

  private store(key: string, entry: CacheEntry<unknown>): void {
    // The keys come from unauthenticated user input, so the cache is bounded
    // on both ends: expired entries are dropped first, then the least recently
    // used ones, keeping the process memory flat under an arbitrary query load.
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      this.evictExpired(Date.now());
    }

    this.cache.set(key, entry);

    while (this.cache.size > CACHE_MAX_ENTRIES) {
      const leastRecentlyUsed = this.cache.keys().next();
      if (leastRecentlyUsed.done) {
        break;
      }

      this.cache.delete(leastRecentlyUsed.value);
    }
  }

  private evictExpired(now: number): void {
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }

  private mapProviderError(
    error: unknown,
    notFoundCode: string,
    notFoundMessage: string,
  ): Error {
    if (!(error instanceof GoogleMapsProviderError)) {
      return error instanceof Error ? error : new Error(String(error));
    }

    switch (error.reason) {
      case 'not_found':
        return new NotFoundException({
          code: notFoundCode,
          message: notFoundMessage,
        });
      case 'rate_limited':
        return new HttpException(
          {
            code: 'EXTERNAL_PROVIDER_RATE_LIMITED',
            message: 'El proveedor externo alcanzó su límite de cuota.',
          },
          429,
        );
      case 'unavailable':
        return new HttpException(
          {
            code: 'EXTERNAL_PROVIDER_UNAVAILABLE',
            message: 'El proveedor externo no está disponible.',
          },
          503,
        );
      case 'provider_error':
      default:
        return new HttpException(
          {
            code: 'EXTERNAL_PROVIDER_ERROR',
            message: 'El proveedor externo devolvió un error.',
          },
          502,
        );
    }
  }
}
