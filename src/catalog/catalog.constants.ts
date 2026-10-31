/**
 * Lifecycle of a catalog entity. Publication is NOT recommendation safety:
 * see `eligibility.ts` for what a published entity may be used for.
 */
export const CATALOG_STATUSES = [
  'draft',
  'in_review',
  'published',
  'archived',
] as const;
export type CatalogStatus = (typeof CATALOG_STATUSES)[number];

/**
 * Where an `activity_place` coordinate came from.
 * - `OWNED`: SmartPlan data we may persist (admin, curated import, official
 *   open data with suitable terms).
 * - `GOOGLE_CACHE`: a temporary provider cache with an expiry. Never exported,
 *   never promoted, never used as canonical data.
 */
export const COORDINATE_SOURCES = ['OWNED', 'GOOGLE_CACHE'] as const;
export type CoordinateSource = (typeof COORDINATE_SOURCES)[number];

/**
 * Google Maps Platform terms allow caching Google latitude/longitude for at
 * most 30 consecutive days. Stay below it with margin.
 */
export const GOOGLE_CACHE_TTL_DAYS = 28;
export const GOOGLE_CACHE_MAX_TTL_DAYS = 30;

/** Licence class of a data source; decides where its data may live. */
export const LICENSE_CLASSES = [
  'OWNED',
  'OPEN_ATTRIB',
  'ODBL',
  'PROVIDER_ID_ONLY',
] as const;
export type LicenseClass = (typeof LICENSE_CLASSES)[number];

/**
 * Data sources whose content may become part of the promoted catalog.
 * ODbL data (OpenStreetMap) is quarantined for v1: a database-licence strategy
 * is a deliberate decision, not a default.
 */
export const PROMOTABLE_LICENSE_CLASSES: readonly LicenseClass[] = [
  'OWNED',
  'OPEN_ATTRIB',
  'PROVIDER_ID_ONLY',
];
