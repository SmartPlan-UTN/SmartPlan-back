import { createHash } from 'node:crypto';
import {
  InvalidPriceError,
  normalizePrice,
  type PriceFields,
  type PriceSource,
  type PriceUnit,
} from '../common/pricing/price';

/**
 * The catalog package: the only shape of data that moves into a catalog
 * import or out of a catalog export (and between staging and production).
 *
 * It is an ALLOW-LIST. Anything not named here is rejected, so provider
 * content that may not be stored long-term (ratings, photos, hours, Google
 * coordinates...) cannot ride along in staging JSON, manifests or packages.
 */

export const CATALOG_PACKAGE_SCHEMA_VERSION = 1;

export interface GeographyRecord {
  country: string;
  city: string;
  departments: string[];
}

export interface PlaceRecord {
  slug: string;
  name: string;
  description: string | null;
  address: string;
  country: string;
  city: string;
  department: string;
  latitude: number | null;
  longitude: number | null;
  kind: string | null;
  /** Google Place ID: an identity link, the only Google value we may keep. */
  googlePlaceId: string | null;
  verifiedAt: string | null;
  sourceRef: string | null;
}

export interface ActivityPriceRecord {
  kind: PriceFields['priceKind'];
  min: number | null;
  max: number | null;
  unit: PriceUnit | null;
  source: PriceSource | null;
  sourceRef: string | null;
  verifiedAt: string | null;
}

export interface ActivityRecord {
  slug: string;
  name: string;
  description: string;
  durationMinutes: number;
  type: string | null;
  categories: string[];
  places: string[];
  price: ActivityPriceRecord;
  verifiedAt: string | null;
}

export interface CatalogPackage {
  schemaVersion: number;
  source: string;
  licenseClass: 'OWNED' | 'OPEN_ATTRIB' | 'PROVIDER_ID_ONLY';
  geography: GeographyRecord[];
  places: PlaceRecord[];
  activities: ActivityRecord[];
}

const PLACE_KEYS = [
  'slug',
  'name',
  'description',
  'address',
  'country',
  'city',
  'department',
  'latitude',
  'longitude',
  'kind',
  'googlePlaceId',
  'verifiedAt',
  'sourceRef',
] as const;

const ACTIVITY_KEYS = [
  'slug',
  'name',
  'description',
  'durationMinutes',
  'type',
  'categories',
  'places',
  'price',
  'verifiedAt',
] as const;

const PRICE_KEYS = [
  'kind',
  'min',
  'max',
  'unit',
  'source',
  'sourceRef',
  'verifiedAt',
] as const;

/**
 * Field names of provider content that must never be persisted by the
 * catalog. Matching is case-insensitive on the key name, at any depth.
 */
export const RESTRICTED_PROVIDER_KEYS: readonly string[] = [
  'rating',
  'userratingcount',
  'externalrating',
  'externalratingcount',
  'formattedaddress',
  'displayname',
  'location',
  'photos',
  'photo',
  'photoname',
  'photoreference',
  'photouri',
  'regularopeninghours',
  'currentopeninghours',
  'openinghours',
  'websiteuri',
  'nationalphonenumber',
  'internationalphonenumber',
  'reviews',
  'reviewsummary',
  'editorialsummary',
  'pricelevel',
  'pricerange',
  'googlemapsuri',
  'attributions',
  'authorattributions',
];

export class RestrictedProviderContentError extends Error {}

/** Throws if any restricted provider field name appears at any depth. */
export function assertNoRestrictedProviderContent(
  value: unknown,
  path = '$',
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoRestrictedProviderContent(item, `${path}[${index}]`),
    );
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (RESTRICTED_PROVIDER_KEYS.includes(key.toLowerCase())) {
        throw new RestrictedProviderContentError(
          `Restricted provider content "${key}" found at ${path}.${key}`,
        );
      }
      assertNoRestrictedProviderContent(child, `${path}.${key}`);
    }
  }
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Source references are shown to curators as links: http(s) only. */
export function isHttpUrl(value: string): boolean {
  if (value.length > 500) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function str(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
}

function unknownKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
): string[] {
  return Object.keys(record).filter((key) => !allowed.includes(key));
}

export interface RecordValidation<T> {
  value: T | null;
  errors: string[];
}

export function validatePlaceRecord(
  raw: unknown,
): RecordValidation<PlaceRecord> {
  const errors: string[] = [];
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { value: null, errors: ['place_not_an_object'] };
  }
  const record = raw as Record<string, unknown>;
  for (const key of unknownKeys(record, PLACE_KEYS)) {
    errors.push(`unknown_field:${key}`);
  }

  const slug = str(record.slug);
  if (!slug || !SLUG.test(slug) || slug.length > 120)
    errors.push('invalid_slug');
  const name = str(record.name);
  if (!name || name.length < 3 || name.length > 150)
    errors.push('invalid_name');
  const address = str(record.address);
  if (!address || address.length < 3 || address.length > 255) {
    errors.push('invalid_address');
  }
  const country = str(record.country);
  const city = str(record.city);
  const department = str(record.department);
  if (!country || !city || !department) errors.push('missing_geography');

  const latitude = num(record.latitude);
  const longitude = num(record.longitude);
  if (
    (latitude === null) !== (longitude === null) ||
    (latitude !== null &&
      (Number.isNaN(latitude) || latitude < -90 || latitude > 90)) ||
    (longitude !== null &&
      (Number.isNaN(longitude) || longitude < -180 || longitude > 180))
  ) {
    errors.push('invalid_coordinates');
  }

  const googlePlaceId = str(record.googlePlaceId);
  if (googlePlaceId && !/^[A-Za-z0-9_-]{10,255}$/.test(googlePlaceId)) {
    errors.push('invalid_place_id');
  }
  const placeSourceRef = str(record.sourceRef);
  if (placeSourceRef && !isHttpUrl(placeSourceRef)) {
    errors.push('invalid_source_ref');
  }
  const verifiedAt = str(record.verifiedAt);
  if (verifiedAt && Number.isNaN(Date.parse(verifiedAt))) {
    errors.push('invalid_verified_at');
  }

  if (errors.length > 0) return { value: null, errors };
  return {
    errors,
    value: {
      slug: slug as string,
      name: name as string,
      description: str(record.description),
      address: address as string,
      country: country as string,
      city: city as string,
      department: department as string,
      latitude,
      longitude,
      kind: str(record.kind),
      googlePlaceId,
      verifiedAt,
      sourceRef: placeSourceRef,
    },
  };
}

export function validateActivityRecord(
  raw: unknown,
): RecordValidation<ActivityRecord> {
  const errors: string[] = [];
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { value: null, errors: ['activity_not_an_object'] };
  }
  const record = raw as Record<string, unknown>;
  for (const key of unknownKeys(record, ACTIVITY_KEYS)) {
    errors.push(`unknown_field:${key}`);
  }

  const slug = str(record.slug);
  if (!slug || !SLUG.test(slug) || slug.length > 120)
    errors.push('invalid_slug');
  const name = str(record.name);
  if (!name || name.length < 3 || name.length > 150)
    errors.push('invalid_name');
  const description = str(record.description);
  if (!description || description.length > 5000) {
    errors.push('invalid_description');
  }
  const duration = num(record.durationMinutes);
  if (
    duration === null ||
    Number.isNaN(duration) ||
    !Number.isInteger(duration) ||
    duration < 1 ||
    duration > 525_600
  ) {
    errors.push('invalid_duration');
  }
  const categories = Array.isArray(record.categories)
    ? record.categories.map(str).filter((c): c is string => c !== null)
    : [];
  if (categories.length === 0) errors.push('missing_categories');
  const places = Array.isArray(record.places)
    ? record.places.map(str).filter((p): p is string => p !== null)
    : [];
  if (places.length === 0) errors.push('missing_places');

  let price: ActivityPriceRecord = {
    kind: 'UNKNOWN',
    min: null,
    max: null,
    unit: null,
    source: null,
    sourceRef: null,
    verifiedAt: null,
  };
  if (record.price !== undefined && record.price !== null) {
    if (typeof record.price !== 'object' || Array.isArray(record.price)) {
      errors.push('invalid_price');
    } else {
      const rawPrice = record.price as Record<string, unknown>;
      for (const key of unknownKeys(rawPrice, PRICE_KEYS)) {
        errors.push(`unknown_price_field:${key}`);
      }
      const priceRef = str(rawPrice.sourceRef);
      if (priceRef && !isHttpUrl(priceRef)) {
        errors.push('invalid_price_source_ref');
      }
      try {
        const normalized = normalizePrice({
          priceKind: rawPrice.kind as PriceFields['priceKind'],
          priceMin: num(rawPrice.min),
          priceMax: num(rawPrice.max),
          priceUnit: (str(rawPrice.unit) as PriceUnit | null) ?? null,
          priceSource: (str(rawPrice.source) as PriceSource | null) ?? null,
          priceSourceRef: str(rawPrice.sourceRef),
          priceVerifiedAt: str(rawPrice.verifiedAt)
            ? new Date(str(rawPrice.verifiedAt) as string)
            : null,
        });
        // A catalog import only carries prices a human can stand behind.
        if (
          normalized.priceKind !== 'UNKNOWN' &&
          normalized.priceSource !== 'OFFICIAL' &&
          normalized.priceSource !== 'CURATED'
        ) {
          errors.push('price_source_not_allowed');
        }
        price = {
          kind: normalized.priceKind,
          min: normalized.priceMin,
          max: normalized.priceMax,
          unit: normalized.priceUnit,
          source: normalized.priceSource,
          sourceRef: normalized.priceSourceRef,
          verifiedAt: normalized.priceVerifiedAt
            ? normalized.priceVerifiedAt.toISOString()
            : null,
        };
      } catch (error) {
        errors.push(
          error instanceof InvalidPriceError
            ? `invalid_price:${error.message}`
            : 'invalid_price',
        );
      }
    }
  }

  const verifiedAt = str(record.verifiedAt);
  if (verifiedAt && Number.isNaN(Date.parse(verifiedAt))) {
    errors.push('invalid_verified_at');
  }

  if (errors.length > 0) return { value: null, errors };
  return {
    errors,
    value: {
      slug: slug as string,
      name: name as string,
      description: description as string,
      durationMinutes: duration as number,
      type: str(record.type),
      categories,
      places,
      price,
      verifiedAt,
    },
  };
}

/** Deterministic JSON: sorted keys, so equal content has an equal hash. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Hash of the catalog content only (not of its envelope or manifest). */
export function contentHash(
  pkg: Pick<CatalogPackage, 'geography' | 'places' | 'activities'>,
): string {
  const sortBySlug = <T extends { slug: string }>(items: T[]) =>
    [...items].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const geography = [...pkg.geography]
    .map((g) => ({ ...g, departments: [...g.departments].sort() }))
    .sort((a, b) =>
      `${a.country}/${a.city}` < `${b.country}/${b.city}` ? -1 : 1,
    );
  return sha256(
    canonicalJson({
      geography,
      places: sortBySlug(pkg.places),
      activities: sortBySlug(
        pkg.activities.map((activity) => ({
          ...activity,
          categories: [...activity.categories].sort(),
          places: [...activity.places].sort(),
        })),
      ),
    }),
  );
}

export interface PackageEnvelope extends CatalogPackage {
  manifest?: {
    version?: number;
    contentHash?: string;
    createdAt?: string;
    counts?: Record<string, number>;
  };
}
