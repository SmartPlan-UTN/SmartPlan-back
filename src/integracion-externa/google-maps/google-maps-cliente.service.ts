import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VariablesEntorno } from '../../config/variables-entorno';
import { DistanciaEntreLugaresDto } from './dto/distancia-entre-lugares.dto';
import { LugarResueltoDto } from './dto/lugar-resuelto.dto';

/** Campos pedidos a Text Search (New). Determina el SKU facturado: ver el spike (#33). */
const FIELD_MASK_TEXT_SEARCH =
  'places.id,places.displayName,places.formattedAddress,places.location';

/** Campos pedidos a Compute Route Matrix. */
const FIELD_MASK_ROUTE_MATRIX =
  'originIndex,destinationIndex,duration,distanceMeters,condition';

interface RespuestaTextSearch {
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
 * invocan `google-maps-cliente.service.spec.ts` (unitario) y
 * `test/google-maps-spike.spike.spec.ts` (corrida real). No implementa CU16
 * ni CU48–CU52 — ver el plan del ticket #33 para el detalle de alcance.
 *
 * Tres APIs, elegidas por necesidad real y no por lo que enumeraba el ticket
 * originalmente (ver `SEGUIMIENTO.md` para la justificación completa):
 * Places API (New) Text Search para resolver un lugar por nombre, Routes API
 * Compute Route Matrix para distancia/duración (Distance Matrix está en
 * Legacy), y Geocoding API para resolver una zona en texto libre.
 */
@Injectable()
export class GoogleMapsClienteService {
  private readonly logger = new Logger(GoogleMapsClienteService.name);
  private readonly apiKey: string;

  constructor(
    private readonly configuracion: ConfigService<VariablesEntorno, true>,
  ) {
    this.apiKey = this.configuracion.get('GOOGLE_MAPS_API_KEY', {
      infer: true,
    });
  }

  /** Places API (New) — Text Search. Devuelve el primer resultado. */
  async buscarLugar(texto: string): Promise<LugarResueltoDto> {
    const respuesta = await fetch(
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

    if (!respuesta.ok) {
      // No se filtra el cuerpo crudo de la respuesta: puede traer detalles de
      // la request. Se loguea server-side y se traduce.
      this.logger.error(
        `Places Text Search falló (${respuesta.status}) para "${texto}"`,
      );
      throw new Error('No se pudo resolver el lugar con Google Places.');
    }

    const datos = (await respuesta.json()) as RespuestaTextSearch;
    const lugar = datos.places?.[0];

    if (!lugar?.location) {
      throw new Error(`Google Places no encontró resultados para "${texto}".`);
    }

    return {
      placeId: lugar.id,
      nombre: lugar.displayName?.text ?? '',
      direccion: lugar.formattedAddress ?? '',
      latitud: lugar.location.latitude,
      longitud: lugar.location.longitude,
    };
  }

  /** Routes API — Compute Route Matrix, origen y destino por `placeId`. */
  async calcularDistancia(
    placeIdOrigen: string,
    placeIdDestino: string,
  ): Promise<DistanciaEntreLugaresDto> {
    const respuesta = await fetch(
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

    if (!respuesta.ok) {
      this.logger.error(
        `Compute Route Matrix falló (${respuesta.status}) para ${placeIdOrigen} -> ${placeIdDestino}`,
      );
      throw new Error('No se pudo calcular la distancia con Google Routes.');
    }

    const elementos = (await respuesta.json()) as ElementoRouteMatrix[];
    const elemento = elementos[0];

    if (
      !elemento ||
      elemento.condition !== 'ROUTE_EXISTS' ||
      elemento.distanceMeters === undefined ||
      !elemento.duration
    ) {
      throw new Error(
        `Google Routes no devolvió una ruta válida entre ${placeIdOrigen} y ${placeIdDestino}.`,
      );
    }

    return {
      distanciaMetros: elemento.distanceMeters,
      // La API devuelve la duración como string tipo "930s".
      duracionSegundos: Number.parseInt(elemento.duration.replace('s', ''), 10),
    };
  }

  /** Geocoding API — resuelve una dirección o zona en texto libre a coordenadas. */
  async geocodificar(
    direccion: string,
  ): Promise<{ latitud: number; longitud: number }> {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', direccion);
    url.searchParams.set('key', this.apiKey);

    const respuesta = await fetch(url);

    if (!respuesta.ok) {
      this.logger.error(
        `Geocoding falló (${respuesta.status}) para "${direccion}"`,
      );
      throw new Error('No se pudo geocodificar la dirección.');
    }

    const datos = (await respuesta.json()) as ResultadoGeocoding;
    const resultado = datos.results?.[0];

    if (datos.status !== 'OK' || !resultado) {
      throw new Error(
        `Google Geocoding no encontró resultados para "${direccion}" (status: ${datos.status}).`,
      );
    }

    return {
      latitud: resultado.geometry.location.lat,
      longitud: resultado.geometry.location.lng,
    };
  }
}
