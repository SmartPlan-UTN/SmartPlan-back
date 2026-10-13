import {
  HttpException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GOOGLE_MAPS_PROVIDER_KEY } from '../database/seeds/definitions';
import { ExternalDataUsageService } from './external-data-usage.service';
import {
  effectiveMonthlyCap,
  PHOTO_MONTHLY_HARD_CAP,
  startOfBudgetMonth,
} from './google-cost';
import {
  GoogleMapsClientService,
  GoogleMapsProviderError,
} from './google-maps/google-maps-client.service';

export const PLACE_PHOTO_USAGE_CONTEXT = 'place-photo';

/** Hosts Google serves place photos from. Anything else is not redirected to. */
const PHOTO_HOST_SUFFIXES = [
  '.googleusercontent.com',
  '.ggpht.com',
  '.googleapis.com',
  '.gstatic.com',
];

export function isTrustedPhotoUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    return (
      url.protocol === 'https:' &&
      PHOTO_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix))
    );
  } catch {
    return false;
  }
}

export interface PlacePhotoAttributionDto {
  /** `false` when Google has no photo for the place. */
  hasPhoto: boolean;
  /** Author attribution that MUST be shown wherever the photo is shown. */
  authors: Array<{ displayName: string; uri: string | null }>;
  /** Content from Google Maps must say so. */
  provider: 'Google Maps';
}

const DEFAULT_WIDTH_PX = 800;
const MAX_WIDTH_PX = 1600;

/** One live photo, for the caller to show with its required credit. */
export interface PlacePhotoMediaDto {
  /** Short-lived Google URI: load it directly, never store it. */
  photoUri: string;
  authors: Array<{ displayName: string; uri: string | null }>;
  provider: 'Google Maps';
}

/**
 * Live Google Place Photos, served under the provider's rules:
 * - the photo is fetched on demand and never copied to our storage;
 * - the photo resource name is never persisted or cached (it expires);
 * - author attributions are returned so the client can display them;
 * - USD 0 paid spend: the photo lookup is the free "IDs only" Place Details
 *   SKU, and each billed photo URI is counted against a hard monthly cap kept
 *   below Google's free allowance (GOOGLE_PHOTO_MONTHLY_CAP, at most 900 of
 *   the 1,000 free). Past the cap no paid call is made; the kill switch
 *   applies too.
 */
@Injectable()
export class PlacePhotosService {
  constructor(
    private readonly googleMaps: GoogleMapsClientService,
    private readonly usage: ExternalDataUsageService,
    @Optional() private readonly configuration?: ConfigService,
  ) {}

  /** Attribution for the first photo of a place (a metadata-only call). */
  async attribution(placeId: string): Promise<PlacePhotoAttributionDto> {
    try {
      const photos = await this.googleMaps.getPlacePhotos(placeId);
      const first = photos[0];
      return {
        hasPhoto: first !== undefined,
        authors: first ? first.authorAttributions : [],
        provider: 'Google Maps',
      };
    } catch (error) {
      throw this.map(error);
    }
  }

  /** First photo plus its attribution, in one free lookup + one photo call. */
  async media(placeId: string, widthPx?: number): Promise<PlacePhotoMediaDto> {
    await this.assertWithinFreeAllowance();
    const width = Math.min(
      Math.max(Math.floor(widthPx ?? DEFAULT_WIDTH_PX), 64),
      MAX_WIDTH_PX,
    );
    try {
      const photos = await this.googleMaps.getPlacePhotos(placeId);
      const first = photos[0];
      if (!first) {
        throw new GoogleMapsProviderError(
          'No photo for this place.',
          'not_found',
        );
      }
      const photoUri = await this.googleMaps.getPhotoUri(first.name, width);
      if (!isTrustedPhotoUri(photoUri)) {
        throw new GoogleMapsProviderError(
          'Google returned an unexpected photo host.',
          'provider_error',
        );
      }
      await this.record(placeId);
      return {
        photoUri,
        authors: first.authorAttributions,
        provider: 'Google Maps',
      };
    } catch (error) {
      throw this.map(error);
    }
  }

  /** A short-lived URI for the first photo, for the caller to redirect to. */
  async photoUri(placeId: string, widthPx?: number): Promise<string> {
    await this.assertWithinFreeAllowance();
    const width = Math.min(
      Math.max(Math.floor(widthPx ?? DEFAULT_WIDTH_PX), 64),
      MAX_WIDTH_PX,
    );
    try {
      const photos = await this.googleMaps.getPlacePhotos(placeId);
      const first = photos[0];
      if (!first) {
        throw new GoogleMapsProviderError(
          'No photo for this place.',
          'not_found',
        );
      }
      const uri = await this.googleMaps.getPhotoUri(first.name, width);
      if (!isTrustedPhotoUri(uri)) {
        // Defence in depth: this value ends up in a Location header.
        throw new GoogleMapsProviderError(
          'Google returned an unexpected photo host.',
          'provider_error',
        );
      }
      await this.record(placeId);
      return uri;
    } catch (error) {
      throw this.map(error);
    }
  }

  private async record(placeId: string): Promise<void> {
    try {
      await this.usage.record(
        GOOGLE_MAPS_PROVIDER_KEY,
        placeId,
        PLACE_PHOTO_USAGE_CONTEXT,
      );
    } catch {
      // The audit trail must never fail a photo that was already served.
    }
  }

  /** Photos left this month before the USD 0 cap (never negative). */
  async remainingThisMonth(now: Date = new Date()): Promise<number> {
    const cap = effectiveMonthlyCap(
      this.configuration?.get<number>('GOOGLE_PHOTO_MONTHLY_CAP'),
      PHOTO_MONTHLY_HARD_CAP,
    );
    const used = await this.usage.countSince(
      [PLACE_PHOTO_USAGE_CONTEXT],
      startOfBudgetMonth(now),
    );
    return Math.max(0, cap - used);
  }

  private async assertWithinFreeAllowance(): Promise<void> {
    if ((await this.remainingThisMonth()) <= 0) {
      throw new HttpException(
        {
          code: 'EXTERNAL_PHOTO_ALLOWANCE_REACHED',
          message: 'Las fotos externas no están disponibles por ahora.',
        },
        503,
      );
    }
  }

  private map(error: unknown): Error {
    if (!(error instanceof GoogleMapsProviderError)) {
      return error instanceof Error ? error : new Error(String(error));
    }
    switch (error.reason) {
      case 'not_found':
        return new NotFoundException({
          code: 'PLACE_PHOTO_NOT_FOUND',
          message: 'El lugar no tiene fotos disponibles.',
        });
      case 'rate_limited':
        return new HttpException(
          {
            code: 'EXTERNAL_PROVIDER_RATE_LIMITED',
            message: 'El proveedor externo alcanzó su límite de cuota.',
          },
          429,
        );
      case 'disabled':
      case 'unavailable':
        return new HttpException(
          {
            code: 'EXTERNAL_PROVIDER_UNAVAILABLE',
            message: 'El proveedor externo no está disponible.',
          },
          503,
        );
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
