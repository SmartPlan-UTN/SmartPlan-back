import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../config/environment-variables';
import { DistanceBetweenPlacesDto } from './dto/distance-between-places.dto';
import { ResolvedPlaceDto } from './dto/resolved-place.dto';

const FIELD_MASK_TEXT_SEARCH =
  'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount';

const FIELD_MASK_ROUTE_MATRIX =
  'originIndex,destinationIndex,duration,distanceMeters,condition';

const FIELD_MASK_PLACE_DETAILS =
  'id,displayName,formattedAddress,location,rating,userRatingCount';

const REQUEST_TIMEOUT_MS = 5000;

export type GoogleMapsProviderErrorReason =
  | 'rate_limited'
  | 'unavailable'
  | 'provider_error'
  | 'not_found';

export class GoogleMapsProviderError extends Error {
  constructor(
    message: string,
    public readonly reason: GoogleMapsProviderErrorReason,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'GoogleMapsProviderError';
  }
}

interface ResponseTextSearch {
  places?: {
    id: string;
    displayName?: { text: string };
    formattedAddress?: string;
    location?: { latitude: number; longitude: number };
    rating?: number;
    userRatingCount?: number;
  }[];
}

interface ResponsePlaceDetails {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
}

interface RouteMatrixElement {
  originIndex?: number;
  destinationIndex?: number;
  duration?: string;
  distanceMeters?: number;
  condition?: string;
}

interface GeocodingResult {
  status: string;
  results?: {
    geometry: { location: { lat: number; lng: number } };
  }[];
}

@Injectable()
export class GoogleMapsClientService {
  private readonly logger = new Logger(GoogleMapsClientService.name);
  private readonly apiKey: string;

  constructor(
    private readonly configuration: ConfigService<EnvironmentVariables, true>,
  ) {
    this.apiKey = this.configuration.get('GOOGLE_MAPS_API_KEY', {
      infer: true,
    });
  }

  private async fetchWithTimeout(
    input: string | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } catch {
      throw new GoogleMapsProviderError(
        'Could not reach the Google Maps Platform.',
        'unavailable',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private classifyHttpError(status: number): GoogleMapsProviderError {
    if (status === 429) {
      return new GoogleMapsProviderError(
        'Google Maps Platform rate limit exceeded.',
        'rate_limited',
        status,
      );
    }

    return new GoogleMapsProviderError(
      'Google Maps Platform returned an error.',
      'provider_error',
      status,
    );
  }

  async searchPlace(text: string): Promise<ResolvedPlaceDto> {
    const response = await this.fetchWithTimeout(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': FIELD_MASK_TEXT_SEARCH,
        },
        body: JSON.stringify({ textQuery: text }),
      },
    );

    if (!response.ok) {
      this.logger.error(
        `Places Text Search failed (${response.status}) for "${text}"`,
      );
      throw this.classifyHttpError(response.status);
    }

    const data = (await response.json()) as ResponseTextSearch;
    const place = data.places?.[0];

    if (!place?.location) {
      throw new GoogleMapsProviderError(
        `Google Places found no results for "${text}".`,
        'not_found',
      );
    }

    return {
      placeId: place.id,
      name: place.displayName?.text ?? '',
      address: place.formattedAddress ?? '',
      latitude: place.location.latitude,
      longitude: place.location.longitude,
      rating: place.rating,
      ratingCount: place.userRatingCount,
    };
  }

  async getPlaceDetails(placeId: string): Promise<ResolvedPlaceDto> {
    const response = await this.fetchWithTimeout(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        method: 'GET',
        headers: {
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': FIELD_MASK_PLACE_DETAILS,
        },
      },
    );

    if (!response.ok) {
      this.logger.error(
        `Place Details failed (${response.status}) for "${placeId}"`,
      );

      if (response.status === 404) {
        throw new GoogleMapsProviderError(
          'Google Maps Platform found no result for the given identifier.',
          'not_found',
          response.status,
        );
      }

      throw this.classifyHttpError(response.status);
    }

    const place = (await response.json()) as ResponsePlaceDetails;

    if (!place.location) {
      throw new GoogleMapsProviderError(
        `Google Places found no result for "${placeId}".`,
        'not_found',
      );
    }

    return {
      placeId: place.id,
      name: place.displayName?.text ?? '',
      address: place.formattedAddress ?? '',
      latitude: place.location.latitude,
      longitude: place.location.longitude,
      rating: place.rating,
      ratingCount: place.userRatingCount,
    };
  }

  async calculateDistance(
    originPlaceId: string,
    destinationPlaceId: string,
  ): Promise<DistanceBetweenPlacesDto> {
    const response = await this.fetchWithTimeout(
      'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': FIELD_MASK_ROUTE_MATRIX,
        },
        body: JSON.stringify({
          origins: [{ waypoint: { placeId: originPlaceId } }],
          destinations: [{ waypoint: { placeId: destinationPlaceId } }],
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_UNAWARE',
        }),
      },
    );

    if (!response.ok) {
      this.logger.error(
        `Compute Route Matrix failed (${response.status}) for ${originPlaceId} -> ${destinationPlaceId}`,
      );
      throw this.classifyHttpError(response.status);
    }

    const elements = (await response.json()) as RouteMatrixElement[];
    const element = elements[0];

    if (
      !element ||
      element.condition !== 'ROUTE_EXISTS' ||
      element.distanceMeters === undefined ||
      !element.duration
    ) {
      throw new GoogleMapsProviderError(
        `Google Routes did not return a valid route between ${originPlaceId} and ${destinationPlaceId}.`,
        'not_found',
      );
    }

    return {
      distanceMeters: element.distanceMeters,
      durationSeconds: Number.parseInt(element.duration.replace('s', ''), 10),
    };
  }

  async geocode(
    address: string,
  ): Promise<{ latitude: number; longitude: number }> {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', address);
    url.searchParams.set('key', this.apiKey);

    const response = await this.fetchWithTimeout(url);

    if (!response.ok) {
      this.logger.error(
        `Geocoding failed (${response.status}) for "${address}"`,
      );
      throw this.classifyHttpError(response.status);
    }

    const data = (await response.json()) as GeocodingResult;
    const result = data.results?.[0];

    if (data.status === 'OVER_QUERY_LIMIT') {
      throw new GoogleMapsProviderError(
        'Google Maps Platform rate limit exceeded.',
        'rate_limited',
      );
    }

    if (data.status !== 'OK' || !result) {
      throw new GoogleMapsProviderError(
        `Google Geocoding found no results for "${address}" (status: ${data.status}).`,
        'not_found',
      );
    }

    return {
      latitude: result.geometry.location.lat,
      longitude: result.geometry.location.lng,
    };
  }
}
