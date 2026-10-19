import { generationSignal } from '../../recommendation/generation-deadline';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommonEnvironmentVariables } from '../../config/environment-variables';
import { DistanceBetweenPlacesDto } from './dto/distance-between-places.dto';
import { ResolvedPlaceDto } from './dto/resolved-place.dto';

const FIELD_MASK_TEXT_SEARCH =
  'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.priceRange,places.businessStatus';

/**
 * Identity matching only (no rating or price): the Text Search "Pro" SKU,
 * with a much larger free monthly allowance than the Enterprise fields.
 */
const FIELD_MASK_TEXT_SEARCH_PRO =
  'places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.primaryType';

/**
 * Text Search Essentials (IDs Only): unlimited free usage. Nothing but the
 * Place ID (the one Places value that may be stored) and the page token.
 * Never widen this mask: any other field moves the call to a paid SKU.
 */
export const FIELD_MASK_TEXT_SEARCH_IDS_ONLY = 'places.id,nextPageToken';

const FIELD_MASK_ROUTE_MATRIX =
  'originIndex,destinationIndex,duration,distanceMeters,condition';

const FIELD_MASK_COMPUTE_ROUTES = 'routes.duration,routes.distanceMeters';

const FIELD_MASK_PLACE_DETAILS =
  'id,displayName,formattedAddress,location,rating,userRatingCount,priceLevel,priceRange,businessStatus';

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
    priceLevel?: string;
    priceRange?: {
      startPrice?: { currencyCode?: string; units?: string; nanos?: number };
      endPrice?: { currencyCode?: string; units?: string; nanos?: number };
    };
    businessStatus?: string;
  }[];
}

interface ResponsePlaceDetails {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  priceRange?: {
    startPrice?: { currencyCode?: string; units?: string; nanos?: number };
    endPrice?: { currencyCode?: string; units?: string; nanos?: number };
  };
  businessStatus?: string;
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

function moneyAmount(money?: {
  units?: string;
  nanos?: number;
}): number | null {
  if (!money || money.units === undefined) return null;
  const amount = Number(money.units) + (money.nanos ?? 0) / 1e9;
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

/** Price/status fields of a Places result, without inventing anything. */
function providerPriceContent(place: {
  priceLevel?: string;
  priceRange?: {
    startPrice?: { currencyCode?: string; units?: string; nanos?: number };
    endPrice?: { currencyCode?: string; units?: string; nanos?: number };
  };
  businessStatus?: string;
}): Pick<ResolvedPlaceDto, 'priceRange' | 'priceLevel' | 'businessStatus'> {
  const out: Pick<
    ResolvedPlaceDto,
    'priceRange' | 'priceLevel' | 'businessStatus'
  > = {};
  const start = moneyAmount(place.priceRange?.startPrice);
  const end = moneyAmount(place.priceRange?.endPrice);
  const currency =
    place.priceRange?.startPrice?.currencyCode ??
    place.priceRange?.endPrice?.currencyCode;
  if ((start !== null || end !== null) && currency) {
    out.priceRange = { min: start, max: end, currency };
  }
  if (place.priceLevel && place.priceLevel !== 'PRICE_LEVEL_UNSPECIFIED') {
    out.priceLevel = place.priceLevel;
  }
  if (place.businessStatus) out.businessStatus = place.businessStatus;
  return out;
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
    init?.signal?.throwIfAborted();
    await this.paceRequest();
    init?.signal?.throwIfAborted();
    this.requestsSent += 1;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      return await fetch(input, {
        ...init,
        signal: init?.signal
          ? AbortSignal.any([controller.signal, init.signal])
          : controller.signal,
      });
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
    const [place] = await this.searchPlaceCandidates(text, 1);
    if (!place) {
      throw new GoogleMapsProviderError(
        `Google Places found no results for "${text}".`,
        'not_found',
      );
    }
    return place;
  }

  /**
   * Up to `maxResults` Text Search candidates, best first. Used by catalog
   * matching, which needs to see ambiguity instead of trusting the first hit.
   */
  async searchPlaceCandidates(
    text: string,
    maxResults = 3,
    tier: 'enterprise' | 'pro' = 'enterprise',
  ): Promise<ResolvedPlaceDto[]> {
    const response = await this.fetchWithTimeout(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask':
            tier === 'pro'
              ? FIELD_MASK_TEXT_SEARCH_PRO
              : FIELD_MASK_TEXT_SEARCH,
        },
        body: JSON.stringify({
          textQuery: text,
          languageCode: 'es',
          regionCode: 'AR',
          pageSize: Math.min(Math.max(1, maxResults), 5),
        }),
      },
    );

    if (!response.ok) {
      this.logger.error(
        `Places Text Search failed (${response.status}) for "${text}"`,
      );
      throw this.classifyHttpError(response.status);
    }

    const data = (await response.json()) as ResponseTextSearch;
    return (data.places ?? [])
      .filter((place) => place.location !== undefined)
      .map((place) => ({
        placeId: place.id,
        name: place.displayName?.text ?? '',
        address: place.formattedAddress ?? '',
        latitude: place.location!.latitude,
        longitude: place.location!.longitude,
        rating: place.rating,
        ratingCount: place.userRatingCount,
        ...providerPriceContent(place),
      }));
  }

  /**
   * ID-only Text Search (free, unlimited SKU): the Place IDs Google returns
   * for a query, in its order, plus the next page token. The order is a
   * request-scoped relevance signal; callers must not persist it as truth.
   */
  async searchPlaceIds(
    textQuery: string,
    options: {
      pageToken?: string;
      pageSize?: number;
      includedType?: string;
      /** Bias circle (metres): results near it, not only inside it. */
      bias?: { latitude: number; longitude: number; radiusMeters: number };
      /** Only results inside this box (branch-accurate identity lookups). */
      restrict?: {
        latitude: number;
        longitude: number;
        halfSideDegrees: number;
      };
      signal?: AbortSignal;
    } = {},
  ): Promise<{ ids: string[]; nextPageToken: string | null }> {
    const body: Record<string, unknown> = {
      textQuery,
      languageCode: 'es',
      regionCode: 'AR',
      pageSize: Math.min(Math.max(1, options.pageSize ?? 20), 20),
    };
    if (options.pageToken) body.pageToken = options.pageToken;
    if (options.includedType) body.includedType = options.includedType;
    if (options.restrict) {
      const { latitude, longitude, halfSideDegrees: d } = options.restrict;
      body.locationRestriction = {
        rectangle: {
          low: { latitude: latitude - d, longitude: longitude - d },
          high: { latitude: latitude + d, longitude: longitude + d },
        },
      };
    } else if (options.bias)
      body.locationBias = {
        circle: {
          center: {
            latitude: options.bias.latitude,
            longitude: options.bias.longitude,
          },
          radius: Math.min(50000, Math.max(1, options.bias.radiusMeters)),
        },
      };
    const response = await this.fetchWithTimeout(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': FIELD_MASK_TEXT_SEARCH_IDS_ONLY,
        },
        body: JSON.stringify(body),
        signal: options.signal,
      },
    );
    if (!response.ok) throw this.classifyHttpError(response.status);
    const data = (await response.json()) as {
      places?: { id?: string }[];
      nextPageToken?: string;
    };
    return {
      ids: (data.places ?? [])
        .map((place) => place.id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
      nextPageToken: data.nextPageToken ?? null,
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
      ...providerPriceContent(place),
    };
  }

  /**
   * A place's position only (Place Details Essentials), for one planning
   * request. The result is provider content: the caller uses it in memory
   * for that request and never persists or exports it (D2).
   */
  async getPlaceLocation(
    placeId: string,
    signal?: AbortSignal,
  ): Promise<{ latitude: number; longitude: number }> {
    const place = await this.placeFields<{
      location?: { latitude: number; longitude: number };
    }>(placeId, 'id,location', signal);
    if (!place.location) {
      throw new GoogleMapsProviderError(
        `Google Places returned no location for "${placeId}".`,
        'not_found',
      );
    }
    return place.location;
  }

  /**
   * The place's opening hours for the coming days (`currentOpeningHours`,
   * the Enterprise SKU), as weekly intervals in minutes from each local
   * weekday's midnight (Places periods are already in the place's local
   * time). Used only to verify a plan finalist for that request; never
   * persisted (D3). `null` when the place publishes no hours.
   */
  async getPlaceCurrentHours(
    placeId: string,
    signal?: AbortSignal,
  ): Promise<{
    weekly: [number, number][][];
    openNow: boolean | null;
    businessStatus: string | null;
    /** Per-person price range in the place's currency, when published. */
    priceRange: { min: number; max: number | null; currency: string } | null;
  } | null> {
    // businessStatus and priceRange ride on the same Enterprise request
    // (both are Place Details Enterprise fields: no extra SKU).
    const place = await this.placeFields<{
      businessStatus?: string;
      priceRange?: {
        startPrice?: { currencyCode?: string; units?: string };
        endPrice?: { currencyCode?: string; units?: string };
      };
      currentOpeningHours?: {
        openNow?: boolean;
        periods?: {
          open?: { day?: number; hour?: number; minute?: number };
          close?: { day?: number; hour?: number; minute?: number };
        }[];
      };
    }>(placeId, 'id,currentOpeningHours,businessStatus,priceRange', signal);
    const hours = place.currentOpeningHours;
    const businessStatus = place.businessStatus ?? null;
    const start = Number(place.priceRange?.startPrice?.units);
    const end = Number(place.priceRange?.endPrice?.units);
    const currency = place.priceRange?.startPrice?.currencyCode ?? null;
    const priceRange =
      Number.isFinite(start) && start > 0 && currency
        ? {
            min: start,
            max: Number.isFinite(end) && end >= start ? end : null,
            currency,
          }
        : null;
    if (businessStatus && businessStatus !== 'OPERATIONAL')
      return {
        weekly: [[], [], [], [], [], [], []],
        openNow: false,
        businessStatus,
        priceRange,
      };
    if (!hours?.periods?.length) return null;
    const weekly: [number, number][][] = [[], [], [], [], [], [], []];
    for (const period of hours.periods) {
      const open = period.open;
      if (open?.day === undefined) continue;
      const opens = (open.hour ?? 0) * 60 + (open.minute ?? 0);
      if (!period.close) {
        // Open around the clock (a single period with no close).
        for (const day of weekly) day.push([0, 2880]);
        break;
      }
      const closeDay = period.close.day ?? open.day;
      const dayOffset = (closeDay - open.day + 7) % 7;
      const closes =
        dayOffset * 1440 +
        (period.close.hour ?? 0) * 60 +
        (period.close.minute ?? 0);
      if (closes > opens)
        weekly[open.day].push([opens, Math.min(2880, closes)]);
    }
    return {
      weekly,
      openNow: hours.openNow ?? null,
      businessStatus,
      priceRange,
    };
  }

  /**
   * A discovered Place ID as a hint for its official source (Place Details
   * Enterprise: name, position, website, status, type). Provider content
   * for one verification only: never persisted (only the Place ID is).
   */
  async getPlaceIdentityHint(
    placeId: string,
    signal?: AbortSignal,
  ): Promise<{
    name: string;
    latitude: number;
    longitude: number;
    website: string | null;
    businessStatus: string | null;
    primaryType: string | null;
  } | null> {
    const place = await this.placeFields<{
      displayName?: { text?: string };
      location?: { latitude: number; longitude: number };
      websiteUri?: string;
      businessStatus?: string;
      primaryType?: string;
    }>(
      placeId,
      'id,displayName,location,websiteUri,businessStatus,primaryType',
      signal,
    );
    if (!place.location || !place.displayName?.text) return null;
    return {
      name: place.displayName.text,
      latitude: place.location.latitude,
      longitude: place.location.longitude,
      website: place.websiteUri ?? null,
      businessStatus: place.businessStatus ?? null,
      primaryType: place.primaryType ?? null,
    };
  }

  private async placeFields<T>(
    placeId: string,
    fieldMask: string,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await this.fetchWithTimeout(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        method: 'GET',
        headers: {
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': fieldMask,
        },
        signal,
      },
    );
    if (!response.ok) {
      if (response.status === 404) {
        throw new GoogleMapsProviderError(
          'Google Maps Platform found no result for the given identifier.',
          'not_found',
          response.status,
        );
      }
      throw this.classifyHttpError(response.status);
    }
    return (await response.json()) as T;
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
    signal?: AbortSignal,
    travelMode: 'drive' | 'walk' | 'bicycle' = 'drive',
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

    const parentSignal = generationSignal();
    const signals = [AbortSignal.timeout(REQUEST_TIMEOUT_MS)];
    if (parentSignal) signals.push(parentSignal);
    if (signal) signals.push(signal);
    const response = await this.fetchWithTimeout(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      {
        signal: AbortSignal.any(signals),
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
          travelMode: { drive: 'DRIVE', walk: 'WALK', bicycle: 'BICYCLE' }[
            travelMode
          ],
          ...(travelMode === 'drive'
            ? { routingPreference: 'TRAFFIC_UNAWARE' }
            : {}),
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
