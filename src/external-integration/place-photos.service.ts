import {
  HttpException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GOOGLE_MAPS_PROVIDER_KEY } from '../database/seeds/definitions';
import { ExternalDataUsageService } from './external-data-usage.service';
import { GOOGLE_UNIT_COST_USD, startOfBudgetMonth } from './google-cost';
import {
  GoogleMapsClientService,
  GoogleMapsProviderError,
} from './google-maps/google-maps-client.service';

export const PLACE_PHOTO_USAGE_CONTEXT = 'place-photo';

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

/**
 * Live Google Place Photos, served under the provider's rules:
 * - the photo is fetched on demand and never copied to our storage;
 * - the photo resource name is never persisted or cached (it expires);
 * - author attributions are returned so the client can display them;
 * - every billed photo call is recorded and counted against the monthly
 *   budget, and the application kill switch applies.
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

  /** A short-lived URI for the first photo, for the caller to redirect to. */
  async photoUri(placeId: string, widthPx?: number): Promise<string> {
    await this.assertWithinBudget();
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

  private async assertWithinBudget(): Promise<void> {
    const budget =
      this.configuration?.get<number>('GOOGLE_CATALOG_MONTHLY_BUDGET_USD') ??
      25;
    const used = await this.usage.countSince(
      [PLACE_PHOTO_USAGE_CONTEXT],
      startOfBudgetMonth(),
    );
    if (used * GOOGLE_UNIT_COST_USD.placePhoto >= budget) {
      throw new HttpException(
        {
          code: 'EXTERNAL_PROVIDER_BUDGET_REACHED',
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
