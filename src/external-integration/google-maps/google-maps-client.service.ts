import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommonEnvironmentVariables } from '../../config/environment-variables';
import { DistanceBetweenPlacesDto } from './dto/distance-between-places.dto';
import { ResolvedPlaceDto } from './dto/resolved-place.dto';

const FIELD_MASK_TEXT_SEARCH =
  'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount';

const FIELD_MASK_ROUTE_MATRIX =
  'originIndex,destinationIndex,duration,distanceMeters,condition';

const FIELD_MASK_COMPUTE_ROUTES = 'routes.duration,routes.distanceMeters';

const FIELD_MASK_PLACE_DETAILS =
  'id,displayName,formattedAddress,location,rating,userRatingCount';

const REQUEST_TIMEOUT_MS = 5000;

export type GoogleMapsProviderErrorReason =
  | 'rate_limited'
  | 'unavailable'
  | 'provider_error'
  | 'not_found'
  // The application kill switch (GOOGLE_PLACES_ENABLED=false) is on.
  | 'disabled';

export interface GooglePlacePhoto {
  /** Resource name; expires, never persisted. */
  name: string;
  widthPx: number | null;
  heightPx: number | null;
  /** Must be shown wherever the photo is shown (Places API policies). */
  authorAttributions: Array<{ displayName: string; uri: string | null }>;
}

export class GoogleMapsProviderError extends Error {
  constructor(
    message: string,
    public readonly reason: GoogleMapsProviderErrorReason,
    public readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
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

interface ComputeRoutesResponse {
  routes?: {
    duration?: string;
    distanceMeters?: number;
  }[];
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
  private readonly enabled: boolean;
  private readonly maxRequestsPerSecond: number;
  /** Start times of the requests sent in the last second (sliding window). */
  private readonly recentRequests: number[] = [];
  private requestsSent = 0;

  constructor(
    private readonly configuration: ConfigService<
      CommonEnvironmentVariables,
      true
    >,
  ) {
    this.apiKey = this.configuration.get('GOOGLE_MAPS_API_KEY', {
      infer: true,
    });
    // Both settings are optional and fail open to the documented defaults.
    const enabled: unknown = this.configuration.get('GOOGLE_PLACES_ENABLED', {
      infer: true,
    });
    this.enabled = !(
      enabled === false ||
      enabled === 'false' ||
      enabled === '0'
    );
    const maxRate = Number(
      this.configuration.get('GOOGLE_MAX_REQUESTS_PER_SECOND', { infer: true }),
    );
    this.maxRequestsPerSecond =
      Number.isFinite(maxRate) && maxRate >= 1 ? Math.floor(maxRate) : 5;
  }

  /** Requests this process has actually sent to Google (usage counter). */
  get sentRequestCount(): number {
    return this.requestsSent;
  }

  /**
   * Keeps the outgoing rate under GOOGLE_MAX_REQUESTS_PER_SECOND so a bulk
   * pass can never burst into the provider's quota.
   */
  private async paceRequest(): Promise<void> {
    for (;;) {
      const now = Date.now();
      while (
        this.recentRequests.length > 0 &&
        now - this.recentRequests[0] >= 1000
      ) {
        this.recentRequests.shift();
      }
      if (this.recentRequests.length < this.maxRequestsPerSecond) {
        this.recentRequests.push(now);
        return;
      }
      const waitMs = 1000 - (now - this.recentRequests[0]);
      await new Promise((resolve) => setTimeout(resolve, Math.max(1, waitMs)));
    }
  }

  private async fetchWithTimeout(
    input: string | URL,
    init?: RequestInit,
  ): Promise<Response> {
    if (!this.enabled) {
      throw new GoogleMapsProviderError(
        'Google Maps Platform calls are disabled (GOOGLE_PLACES_ENABLED=false).',
        'disabled',
      );
    }
    await this.paceRequest();
    this.requestsSent += 1;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } catch (error) {
      // A timeout, a DNS failure and a TLS error all land here: without the
      // cause the dead-lettered job would identify none of them.
      this.logger.warn(
        `Could not reach the Google Maps Platform: ${error instanceof Error ? error.message : String(error)}`,
      );

      throw new GoogleMapsProviderError(
        'Could not reach the Google Maps Platform.',
        'unavailable',
        undefined,
        { cause: error },
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

    if (status === 408 || status >= 500) {
      return new GoogleMapsProviderError(
        'Google Maps Platform is temporarily unavailable.',
        'unavailable',
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

  /**
   * Fresh photo metadata for a place (Places API New, `photos` only: the
   * "IDs only" SKU). Photo resource names expire and may not be cached, so the
   * result is used for the request that asked for it and never stored.
   */
  async getPlacePhotos(placeId: string): Promise<GooglePlacePhoto[]> {
    const response = await this.fetchWithTimeout(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        method: 'GET',
        headers: {
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': 'photos',
        },
      },
    );

    if (!response.ok) {
      this.logger.error(
        `Place photos failed (${response.status}) for "${placeId}"`,
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

    const body = (await response.json()) as {
      photos?: Array<{
        name: string;
        widthPx?: number;
        heightPx?: number;
        authorAttributions?: Array<{
          displayName?: string;
          uri?: string;
          photoUri?: string;
        }>;
      }>;
    };

    return (body.photos ?? []).map((photo) => ({
      name: photo.name,
      widthPx: photo.widthPx ?? null,
      heightPx: photo.heightPx ?? null,
      authorAttributions: (photo.authorAttributions ?? []).map((author) => ({
        displayName: author.displayName ?? '',
        uri: author.uri ?? null,
      })),
    }));
  }

  /**
   * A short-lived URI for one photo. Billed per call (Place Photos SKU), so
   * callers go through the budget-guarded photo service.
   */
  async getPhotoUri(photoName: string, maxWidthPx: number): Promise<string> {
    if (!/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(photoName)) {
      throw new GoogleMapsProviderError(
        'Invalid photo resource name.',
        'provider_error',
      );
    }
    const url = new URL(`https://places.googleapis.com/v1/${photoName}/media`);
    url.searchParams.set('maxWidthPx', String(maxWidthPx));
    url.searchParams.set('skipHttpRedirect', 'true');

    const response = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers: { 'X-Goog-Api-Key': this.apiKey },
    });
    if (!response.ok) {
      this.logger.error(`Place photo media failed (${response.status})`);
      if (response.status === 404) {
        throw new GoogleMapsProviderError(
          'The photo is no longer available.',
          'not_found',
          response.status,
        );
      }
      throw this.classifyHttpError(response.status);
    }
    const body = (await response.json()) as { photoUri?: string };
    if (!body.photoUri) {
      throw new GoogleMapsProviderError(
        'Google returned no photo URI.',
        'not_found',
      );
    }
    return body.photoUri;
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

  /**
   * Calculates the total distance/duration of an ordered itinerary through
   * `computeRoutes` (Routes API), the only endpoint that respects waypoint
   * order in a single request. `computeRouteMatrix` (used by
   * calculateDistance above) cannot express this: it only returns the
   * cartesian product of independent origin/destination pairs.
   */
  async calculateRoute(
    waypoints: { latitude: number; longitude: number }[],
  ): Promise<DistanceBetweenPlacesDto> {
    if (waypoints.length < 2) {
      throw new Error(
        'calculateRoute requires at least an origin and a destination.',
      );
    }

    const origin = waypoints[0];
    const destination = waypoints[waypoints.length - 1];
    const intermediates = waypoints.slice(1, -1);
    const asLatLngWaypoint = (point: {
      latitude: number;
      longitude: number;
    }) => ({
      location: {
        latLng: { latitude: point.latitude, longitude: point.longitude },
      },
    });

    const response = await this.fetchWithTimeout(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': FIELD_MASK_COMPUTE_ROUTES,
        },
        body: JSON.stringify({
          origin: asLatLngWaypoint(origin),
          destination: asLatLngWaypoint(destination),
          intermediates: intermediates.map(asLatLngWaypoint),
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_UNAWARE',
        }),
      },
    );

    if (!response.ok) {
      this.logger.error(`Compute Routes failed (${response.status})`);
      throw this.classifyHttpError(response.status);
    }

    const data = (await response.json()) as ComputeRoutesResponse;
    const route = data.routes?.[0];

    if (!route || route.distanceMeters === undefined || !route.duration) {
      throw new GoogleMapsProviderError(
        'Google Routes did not return a valid itinerary.',
        'not_found',
      );
    }

    return {
      distanceMeters: route.distanceMeters,
      durationSeconds: Number.parseInt(route.duration.replace('s', ''), 10),
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

    if (data.status === 'UNKNOWN_ERROR') {
      throw new GoogleMapsProviderError(
        'Google Maps Platform could not process the geocoding request.',
        'unavailable',
      );
    }

    if (data.status === 'ZERO_RESULTS') {
      throw new GoogleMapsProviderError(
        `Google Geocoding found no results for "${address}" (status: ${data.status}).`,
        'not_found',
      );
    }

    if (data.status !== 'OK' || !result) {
      throw new GoogleMapsProviderError(
        `Google Geocoding returned an invalid response (status: ${data.status}).`,
        'provider_error',
      );
    }

    return {
      latitude: result.geometry.location.lat,
      longitude: result.geometry.location.lng,
    };
  }
}
