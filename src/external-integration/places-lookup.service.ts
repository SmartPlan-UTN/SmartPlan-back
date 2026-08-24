import { HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { GeocodedAddressDto } from './dto/geocoded-address.dto';
import {
  GoogleMapsClientService,
  GoogleMapsProviderError,
} from './google-maps/google-maps-client.service';
import { ResolvedPlaceDto } from './google-maps/dto/resolved-place.dto';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

@Injectable()
export class PlacesLookupService {
  private readonly cache = new Map<string, CacheEntry<unknown>>();

  constructor(private readonly googleMaps: GoogleMapsClientService) {}

  async searchPlace(query: string): Promise<ResolvedPlaceDto> {
    const key = `search:${query.toLowerCase()}`;
    try {
      return await this.withCache(key, () =>
        this.googleMaps.searchPlace(query),
      );
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
      return await this.withCache(key, () => this.googleMaps.geocode(address));
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

    if (cached && cached.expiresAt > now) {
      return cached.value as T;
    }

    const value = await load();
    this.cache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
    return value;
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
