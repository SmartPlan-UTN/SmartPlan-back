import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../config/environment-variables';
import { DistanceBetweenPlacesDto } from './dto/distance-between-places.dto';
import { ResolvedPlaceDto } from './dto/resolved-place.dto';

/** Campos pedidos a Text Search (New). Determina el SKU facturado: ver el spike (#33). */
const FIELD_MASK_TEXT_SEARCH =
  'places.id,places.displayName,places.formattedAddress,places.location';

/** Campos pedidos a Compute Route Matrix. */
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

interface ElementoRouteMatrix {
  originIndex?: number;
  destinationIndex?: number;
  duration?: string;
  distanceMeters?: number;
  condition?: string;
}

interface ResultadoGeocoding {
  status: string;
  results?: {
    geometry: { location: { lat: number; lng: number } };
  }[];
}

/**
 * Cliente del spike de integración con Google Maps Platform (ticket #33).
 *
 * Código de referencia, sin registrar en ningún módulo de Nest: solo lo
 * invocan `google-maps-client.service.spec.ts` (unitario) y
 * `test/google-maps-spike.spike.spec.ts` (corrida real). No implementa CU16
 * ni CU48–CU52 — ver el plan del ticket #33 para el detail de alcance.
 *
 * Tres APIs, elegidas por necesidad real y no por lo que enumeraba el ticket
 * originalmente (ver `TRACKING.md` para la justificación completa):
 * Places API (New) Text Search para resolver un place por name, Routes API
 * Compute Route Matrix para distancia/duración (Distance Matrix está en
 * Legacy), y Geocoding API para resolver una zona en texto libre.
 */
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

  /** Places API (New) — Text Search. Devuelve el primer result. */
  async buscarPlace(texto: string): Promise<ResolvedPlaceDto> {
    const response = await fetch(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': FIELD_MASK_TEXT_SEARCH,
        },
        body: JSON.stringify({ textQuery: texto }),
      },
    );

    if (!response.ok) {
      // No se filtra el body crudo de la response: puede traer details de
      // la request. Se loguea server-side y se traduce.
      this.logger.error(
        `Places Text Search falló (${response.status}) para "${texto}"`,
      );
      throw new Error('No se pudo resolver el place con Google Places.');
    }

    const data = (await response.json()) as ResponseTextSearch;
    const place = data.places?.[0];

    if (!place?.location) {
      throw new Error(`Google Places no encontró resultados para "${texto}".`);
    }

    return {
      placeId: place.id,
      name: place.displayName?.text ?? '',
      address: place.formattedAddress ?? '',
      latitude: place.location.latitude,
      longitude: place.location.longitude,
    };
  }

  /** Routes API — Compute Route Matrix, origen y destination por `placeId`. */
  async calcularDistancia(
    placeIdOrigen: string,
    placeIdDestino: string,
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
          origins: [{ waypoint: { placeId: placeIdOrigen } }],
          destinations: [{ waypoint: { placeId: placeIdDestino } }],
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_UNAWARE',
        }),
      },
    );

    if (!response.ok) {
      this.logger.error(
        `Compute Route Matrix falló (${response.status}) para ${placeIdOrigen} -> ${placeIdDestino}`,
      );
      throw new Error('No se pudo calcular la distancia con Google Routes.');
    }

    const elementos = (await response.json()) as ElementoRouteMatrix[];
    const elemento = elementos[0];

    if (
      !elemento ||
      elemento.condition !== 'ROUTE_EXISTS' ||
      elemento.distanceMeters === undefined ||
      !elemento.duration
    ) {
      throw new Error(
        `Google Routes no devolvió una route válida entre ${placeIdOrigen} y ${placeIdDestino}.`,
      );
    }

    return {
      distanciaMetros: elemento.distanceMeters,
      // La API devuelve la duración como string type "930s".
      durationSegundos: Number.parseInt(elemento.duration.replace('s', ''), 10),
    };
  }

  /** Geocoding API — resuelve una dirección o zona en texto libre a coordinates. */
  async geocodificar(
    address: string,
  ): Promise<{ latitude: number; longitude: number }> {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', address);
    url.searchParams.set('key', this.apiKey);

    const response = await fetch(url);

    if (!response.ok) {
      this.logger.error(
        `Geocoding falló (${response.status}) para "${address}"`,
      );
      throw new Error('No se pudo geocodificar la dirección.');
    }

    const data = (await response.json()) as ResultadoGeocoding;
    const result = data.results?.[0];

    if (data.status !== 'OK' || !result) {
      throw new Error(
        `Google Geocoding no encontró resultados para "${address}" (status: ${data.status}).`,
      );
    }

    return {
      latitude: result.geometry.location.lat,
      longitude: result.geometry.location.lng,
    };
  }
}
