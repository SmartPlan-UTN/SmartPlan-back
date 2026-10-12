import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ActivityPlace } from '../activities/entities/activity-place.entity';
import { GOOGLE_MAPS_PROVIDER_KEY } from '../database/seeds/definitions';
import { ExternalDataUsageService } from './external-data-usage.service';
import { GoogleMapsClientService } from './google-maps/google-maps-client.service';
import { PlacePhotoAuthorDto } from './google-maps/dto/place-photo.dto';
import { providerErrorToHttp } from './provider-error-to-http';

const PLACE_PHOTO_USAGE_CONTEXT = 'place-photo';

const PLACE_PHOTO_NOT_FOUND = {
  code: 'PLACE_PHOTO_NOT_FOUND',
  message: 'El lugar no tiene una foto disponible.',
} as const;

export interface PlacePhoto {
  body: Buffer;
  contentType: string;
  authors: PlacePhotoAuthorDto[];
}

/**
 * Reference photos of an activity's place, straight from Google Places
 * (#102). Only the place ID is stored: the Terms forbid caching photo names
 * or images, so every request resolves a fresh name and downloads it.
 */
@Injectable()
export class PlacePhotosService {
  private readonly logger = new Logger(PlacePhotosService.name);

  constructor(
    @InjectRepository(ActivityPlace)
    private readonly activityPlaces: Repository<ActivityPlace>,
    private readonly googleMaps: GoogleMapsClientService,
    private readonly externalDataUsage: ExternalDataUsageService,
  ) {}

  async getActivityPlacePhoto(
    activityPlaceId: number,
    maxWidthPx: number,
  ): Promise<PlacePhoto> {
    const activityPlace = await this.activityPlaces.findOne({
      where: { id: activityPlaceId, deletedAt: IsNull() },
    });

    if (!activityPlace?.googlePlaceId) {
      throw new NotFoundException(PLACE_PHOTO_NOT_FOUND);
    }

    try {
      const photo = await this.googleMaps.getPlacePhoto(
        activityPlace.googlePlaceId,
      );

      if (!photo) {
        throw new NotFoundException(PLACE_PHOTO_NOT_FOUND);
      }

      const media = await this.googleMaps.fetchPhotoMedia(
        photo.name,
        maxWidthPx,
      );
      await this.recordUsage(activityPlace.googlePlaceId);

      return { ...media, authors: photo.authors };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      throw providerErrorToHttp(
        error,
        PLACE_PHOTO_NOT_FOUND.code,
        PLACE_PHOTO_NOT_FOUND.message,
      );
    }
  }

  private async recordUsage(googlePlaceId: string): Promise<void> {
    try {
      await this.externalDataUsage.record(
        GOOGLE_MAPS_PROVIDER_KEY,
        googlePlaceId,
        PLACE_PHOTO_USAGE_CONTEXT,
      );
    } catch (error) {
      // The audit trail must never cost the user a photo already downloaded.
      this.logger.warn(
        `Could not record external data usage for place photo ${googlePlaceId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
