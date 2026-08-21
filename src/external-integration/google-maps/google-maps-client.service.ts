import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../config/environment-variables';
import { DistanceBetweenPlacesDto } from './dto/distance-between-places.dto';
import { ResolvedPlaceDto } from './dto/resolved-place.dto';

const FIELD_MASK_TEXT_SEARCH =
  'places.id,places.displayName,places.formattedAddress,places.location';

const FIELD_MASK_ROUTE_MATRIX =
  'originIndex,destinationIndex,duration,distanceMeters,condition';

interface ResponseTextSearch {
  places?: {
    id: string;
    displayName?: { text: string };
    formattedAddress?: string;
    location?: { latitude: number; longitude: number };
  }[];
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

  async searchPlace(text: string): Promise<ResolvedPlaceDto> {
    const response = await fetch(
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
      throw new Error('Google Places could not resolve the place.');
    }

    const data = (await response.json()) as ResponseTextSearch;
    const place = data.places?.[0];

    if (!place?.location) {
      throw new Error(`Google Places found no results for "${text}".`);
    }

    return {
      placeId: place.id,
      name: place.displayName?.text ?? '',
      address: place.formattedAddress ?? '',
      latitude: place.location.latitude,
      longitude: place.location.longitude,
    };
  }

  async calculateDistance(
    originPlaceId: string,
    destinationPlaceId: string,
  ): Promise<DistanceBetweenPlacesDto> {
    const response = await fetch(
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
      throw new Error('Google Routes could not calculate the distance.');
    }

    const elements = (await response.json()) as RouteMatrixElement[];
    const element = elements[0];

    if (
      !element ||
      element.condition !== 'ROUTE_EXISTS' ||
      element.distanceMeters === undefined ||
      !element.duration
    ) {
      throw new Error(
        `Google Routes did not return a valid route between ${originPlaceId} and ${destinationPlaceId}.`,
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

    const response = await fetch(url);

    if (!response.ok) {
      this.logger.error(
        `Geocoding failed (${response.status}) for "${address}"`,
      );
      throw new Error('Google Geocoding could not geocode the address.');
    }

    const data = (await response.json()) as GeocodingResult;
    const result = data.results?.[0];

    if (data.status !== 'OK' || !result) {
      throw new Error(
        `Google Geocoding found no results for "${address}" (status: ${data.status}).`,
      );
    }

    return {
      latitude: result.geometry.location.lat,
      longitude: result.geometry.location.lng,
    };
  }
}
