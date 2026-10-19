/**
 * Georef Argentina (datos.gob.ar, CC BY 4.0): street-address geocoding.
 * Results are accepted only when unambiguous (one exact street/height hit
 * in the requested department). Cached on disk so runs are reproducible.
 * https://datosgobar.github.io/georef-ar-api/
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { normalizeText } from './extract/hours-text';
import { abortable } from './fetch/deadline';

const { sameStreet } =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../catalog-data/mendoza-v1/normalize-address.cjs') as {
    sameStreet: (requested: string, resolved: string) => boolean;
  };

const DEPARTMENTS_TO_GEOREF: Record<string, string> = {
  'Ciudad de Mendoza': 'Capital',
  'Godoy Cruz': 'Godoy Cruz',
  Guaymallén: 'Guaymallén',
  Maipú: 'Maipú',
  'Luján de Cuyo': 'Luján de Cuyo',
  'Las Heras': 'Las Heras',
  Tupungato: 'Tupungato',
  Tunuyán: 'Tunuyán',
  'San Carlos': 'San Carlos',
  'San Rafael': 'San Rafael',
};
const GEOREF_TO_CATALOG = Object.fromEntries(
  Object.entries(DEPARTMENTS_TO_GEOREF).map(([c, g]) => [g, c]),
);

export interface GeorefPoint {
  latitude: number;
  longitude: number;
  department: string;
  normalized: string;
  ref: string;
}

export class GeorefClient {
  private cache: Record<string, GeorefPoint | null>;

  constructor(private readonly cacheFile: string | null) {
    this.cache =
      cacheFile && existsSync(cacheFile)
        ? (JSON.parse(readFileSync(cacheFile, 'utf8')) as Record<
            string,
            GeorefPoint | null
          >)
        : {};
    // Old caches could contain null after a network outage. Only successful
    // coordinates survive a new run; negative matches are cached in-run.
    this.cache = Object.fromEntries(
      Object.entries(this.cache).filter(([, value]) => value !== null),
    );
  }

  private persist(): void {
    if (this.cacheFile)
      writeFileSync(this.cacheFile, JSON.stringify(this.cache, null, 1));
  }

  /** Department of a coordinate (catalog name), or null. */
  async departmentAt(
    latitude: number,
    longitude: number,
    signal?: AbortSignal,
  ): Promise<string | null> {
    const key = `rev|${latitude.toFixed(5)},${longitude.toFixed(5)}`;
    if (key in this.cache) return this.cache[key]?.department ?? null;
    const url = new URL('https://apis.datos.gob.ar/georef/api/ubicacion');
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    const body = (await this.get(url, signal)) as {
      ubicacion?: {
        provincia?: { nombre?: string };
        departamento?: { nombre?: string };
      };
    } | null;
    if (!body) return null;
    signal?.throwIfAborted();
    const georefDept = body?.ubicacion?.departamento?.nombre;
    const department =
      body?.ubicacion?.provincia?.nombre === 'Mendoza' && georefDept
        ? (GEOREF_TO_CATALOG[georefDept] ?? null)
        : null;
    this.cache[key] = department
      ? { latitude, longitude, department, normalized: '', ref: url.toString() }
      : null;
    this.persist();
    return department;
  }

  async geocode(
    street: string,
    number: string,
    department: string,
    signal?: AbortSignal,
  ): Promise<GeorefPoint | null> {
    const dept = DEPARTMENTS_TO_GEOREF[department];
    if (!dept) return null;
    const query = `${street} ${number}`;
    const key = `dir|${normalizeText(query)}|${dept}`;
    if (key in this.cache) return this.cache[key];
    const url = new URL('https://apis.datos.gob.ar/georef/api/direcciones');
    url.searchParams.set('direccion', query);
    url.searchParams.set('departamento', dept);
    url.searchParams.set('provincia', 'Mendoza');
    url.searchParams.set('max', '5');
    const body = (await this.get(url, signal)) as {
      total?: number;
      direcciones?: {
        nomenclatura?: string;
        calle?: { nombre?: string };
        departamento?: { nombre?: string };
        altura?: { valor?: number | null };
        ubicacion?: { lat?: number | null; lon?: number | null };
      }[];
    } | null;
    if (!body) return null;
    signal?.throwIfAborted();
    const hits = (body?.direcciones ?? []).filter(
      (hit) =>
        hit.departamento?.nombre === dept &&
        sameStreet(street, hit.calle?.nombre ?? '') &&
        hit.altura?.valor === Number(number) &&
        Number.isFinite(hit.ubicacion?.lat) &&
        Number.isFinite(hit.ubicacion?.lon),
    );
    const hit = hits.length === 1 ? hits[0] : null;
    const value = hit
      ? {
          latitude: Number(hit.ubicacion!.lat!.toFixed(6)),
          longitude: Number(hit.ubicacion!.lon!.toFixed(6)),
          department,
          normalized: hit.nomenclatura ?? query,
          ref: url.toString(),
        }
      : null;
    this.cache[key] = value;
    this.persist();
    return value;
  }

  private async get(url: URL, signal?: AbortSignal): Promise<unknown> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      signal?.throwIfAborted();
      try {
        const deadline = signal
          ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
          : AbortSignal.timeout(15000);
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'SmartPlan-knowledge/1.0 (+https://smartplan.ar/bot)',
          },
          signal: deadline,
        });
        if (response.status === 429 || response.status >= 500) {
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
          continue;
        }
        await new Promise((r) => setTimeout(r, 150));
        return response.ok ? await abortable(response.json(), deadline) : null;
      } catch {
        signal?.throwIfAborted();
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    return null;
  }
}
