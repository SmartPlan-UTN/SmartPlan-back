/**
 * Does this page belong to this venue? A URL is never trusted because a
 * search ranked it or a hint listed it: the fetched page must corroborate
 * the venue with independent signals.
 *
 * VERIFIED needs the name AND one locating signal (street + number, a
 * published point within 300 m, the phone), or the name in the domain AND
 * the city. A chain's generic page is NOT_BRANCH: it may describe the brand,
 * but its hours are not this branch's hours unless the branch address is on
 * the page.
 */
import { normalizeText } from './extract/hours-text';
import type { BusinessFacts } from './extract/business-facts';
import type { PageContent } from './extract/page';

export interface VenueIdentity {
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  departmentName: string | null;
  telephones?: string[];
  /** Other catalog places sharing this source's domain (a chain). */
  siblingsOnDomain?: number;
}

export type IdentityStatus =
  | 'VERIFIED'
  | 'NOT_BRANCH'
  | 'UNCONFIRMED'
  | 'MISMATCH';

export interface IdentityCheck {
  status: IdentityStatus;
  signals: string[];
}

const GENERIC = new Set([
  'restaurante',
  'restaurant',
  'resto',
  'bar',
  'cafe',
  'cafeteria',
  'bodega',
  'bodegas',
  'finca',
  'la',
  'el',
  'los',
  'las',
  'de',
  'del',
  'y',
  'mendoza',
  'heladeria',
  'pizzeria',
  'parrilla',
  'cerveceria',
  'brew',
  'pub',
  'sucursal',
]);

export function nameTokens(name: string): string[] {
  return normalizeText(name)
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !GENERIC.has(token));
}

const compact = (text: string) => normalizeText(text).replace(/[^a-z0-9]/g, '');

function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h));
}

/** "Belgrano 1200" → street words + number, for matching in page text. */
export function streetAndNumber(address: string | null): {
  street: string;
  number: string;
} | null {
  if (!address) return null;
  const normal = normalizeText(address).replace(
    /\b(av|avenida|calle|bv|boulevard)\.?\s+/g,
    '',
  );
  const match = /([a-z][a-z .]{2,}?)\s+(\d{2,5})\b/.exec(normal);
  if (!match) return null;
  return { street: match[1].trim().split(' ').slice(-1)[0], number: match[2] };
}

export function checkIdentity(
  venue: VenueIdentity,
  page: PageContent,
  facts: BusinessFacts,
): IdentityCheck {
  const signals: string[] = [];
  const tokens = nameTokens(venue.name);
  const text = normalizeText(
    [
      page.title,
      page.siteName ?? '',
      ...facts.names,
      ...page.lines.slice(0, 400),
    ].join('\n'),
  );
  const host = new URL(page.url).hostname.replace(/^www\./, '');
  const venueCompact = tokens.join('');
  const nameInText =
    tokens.length > 0 &&
    tokens.filter((token) => new RegExp(`\\b${token}\\b`).test(text)).length >=
      Math.ceil(tokens.length * 0.67);
  const nameInDomain =
    venueCompact.length >= 4 &&
    compact(host.split('.')[0]).includes(venueCompact.slice(0, 12));
  if (nameInText) signals.push('name_on_page');
  if (nameInDomain) signals.push('name_in_domain');
  if (!nameInText && !nameInDomain) return { status: 'MISMATCH', signals };

  const fullText = normalizeText(
    page.lines.join('\n') + '\n' + facts.addresses.join('\n'),
  );
  const street = streetAndNumber(venue.address);
  const addressOnPage =
    street !== null &&
    new RegExp(`\\b${street.street}\\b[^\\n]{0,25}\\b${street.number}\\b`).test(
      fullText,
    );
  if (addressOnPage) signals.push('address_on_page');

  if (facts.geo && venue.latitude !== null && venue.longitude !== null) {
    const meters = distanceMeters(facts.geo, {
      latitude: venue.latitude,
      longitude: venue.longitude,
    });
    if (meters <= 300) signals.push('geo_within_300m');
    else if (meters > 5000) signals.push('geo_far');
  }
  const digits = (value: string) => value.replace(/\D/g, '').slice(-7);
  const venuePhones = new Set(
    (venue.telephones ?? []).map(digits).filter((d) => d.length === 7),
  );
  if (
    venuePhones.size &&
    [
      ...facts.telephones,
      ...(page.lines.join(' ').match(/\d[\d\s-]{6,}\d/g) ?? []),
    ]
      .map(digits)
      .some((d) => venuePhones.has(d))
  )
    signals.push('phone_on_page');
  const cityOnPage =
    /\bmendoza\b|\bgodoy cruz\b|\bmaipu\b|\blujan\b|\bchacras\b|\bguaymallen\b|\bsan rafael\b|\btunuyan\b|\btupungato\b|\bvalle de uco\b/.test(
      fullText,
    );
  if (cityOnPage) signals.push('city_on_page');

  if (signals.includes('geo_far') && !addressOnPage)
    return { status: 'MISMATCH', signals };
  const locating =
    addressOnPage ||
    signals.includes('geo_within_300m') ||
    signals.includes('phone_on_page');
  if ((venue.siblingsOnDomain ?? 0) > 0 && !locating)
    return { status: 'NOT_BRANCH', signals };
  if (locating || (nameInDomain && cityOnPage))
    return { status: 'VERIFIED', signals };
  return { status: 'UNCONFIRMED', signals };
}
