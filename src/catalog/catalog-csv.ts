import type { CatalogPackage } from './catalog-package';

/**
 * Curated CSV adapter: the working format for loading prices and activities
 * that a person verified at the source. Strict on purpose: an unknown column
 * is an error, so provider fields cannot be smuggled in as spreadsheet columns.
 */

export const PLACE_COLUMNS = [
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
  'coordinatesRef',
  'imageUrl',
  'imageLicense',
  'imageAuthor',
  'imageSourceUrl',
] as const;

export const ACTIVITY_COLUMNS = [
  'slug',
  'name',
  'description',
  'durationMinutes',
  'type',
  'categories',
  'places',
  'priceKind',
  'priceMin',
  'priceMax',
  'priceUnit',
  'priceSource',
  'priceSourceRef',
  'priceVerifiedAt',
  'verifiedAt',
  'availableMonths',
  'minPeople',
  'maxPeople',
] as const;

/** RFC 4180 subset: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const source = text.startsWith(String.fromCharCode(0xfeff))
    ? text.slice(1)
    : text;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  return rows;
}

function toObjects(
  csv: string,
  allowed: readonly string[],
  label: string,
): Array<Record<string, string>> {
  const [header, ...rows] = parseCsv(csv);
  if (!header) return [];
  const columns = header.map((column) => column.trim());
  const unknown = columns.filter((column) => !allowed.includes(column));
  if (unknown.length > 0) {
    throw new Error(
      `${label}: unknown column(s) ${unknown.join(', ')}. Allowed: ${allowed.join(', ')}`,
    );
  }
  return rows.map((cells) => {
    const record: Record<string, string> = {};
    columns.forEach((column, index) => {
      record[column] = (cells[index] ?? '').trim();
    });
    return record;
  });
}

const nullable = (value: string | undefined): string | null =>
  value === undefined || value === '' ? null : value;

const numeric = (value: string | undefined): number | null => {
  if (value === undefined || value === '') return null;
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) ? n : Number.NaN;
};

const list = (value: string | undefined): string[] =>
  (value ?? '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);

export function csvToPackage(input: {
  placesCsv: string;
  activitiesCsv: string;
  source: string;
  licenseClass?: CatalogPackage['licenseClass'];
}): Record<string, unknown> {
  const places = toObjects(input.placesCsv, PLACE_COLUMNS, 'places.csv').map(
    (row) => ({
      slug: row.slug,
      name: row.name,
      description: nullable(row.description),
      address: row.address,
      country: row.country,
      city: row.city,
      department: row.department,
      latitude: numeric(row.latitude),
      longitude: numeric(row.longitude),
      kind: nullable(row.kind),
      googlePlaceId: nullable(row.googlePlaceId),
      verifiedAt: nullable(row.verifiedAt),
      sourceRef: nullable(row.sourceRef),
      ...(nullable(row.coordinatesRef)
        ? { coordinatesRef: row.coordinatesRef }
        : {}),
      ...(nullable(row.imageUrl)
        ? {
            image: {
              url: row.imageUrl,
              license: nullable(row.imageLicense),
              author: nullable(row.imageAuthor),
              sourceUrl: nullable(row.imageSourceUrl),
            },
          }
        : {}),
    }),
  );

  const activities = toObjects(
    input.activitiesCsv,
    ACTIVITY_COLUMNS,
    'activities.csv',
  ).map((row) => ({
    slug: row.slug,
    name: row.name,
    description: row.description,
    durationMinutes: numeric(row.durationMinutes),
    ...(row.minPeople || row.maxPeople
      ? { minPeople: numeric(row.minPeople), maxPeople: numeric(row.maxPeople) }
      : {}),
    type: nullable(row.type),
    categories: list(row.categories),
    places: list(row.places),
    // An empty price kind is an UNKNOWN price, never a price of zero.
    price: {
      kind:
        row.priceKind === '' || row.priceKind === undefined
          ? 'UNKNOWN'
          : row.priceKind,
      min: numeric(row.priceMin),
      max: numeric(row.priceMax),
      unit: nullable(row.priceUnit),
      source: nullable(row.priceSource),
      sourceRef: nullable(row.priceSourceRef),
      verifiedAt: nullable(row.priceVerifiedAt),
    },
    verifiedAt: nullable(row.verifiedAt),
    ...(list(row.availableMonths).length > 0
      ? { availableMonths: list(row.availableMonths).map(Number) }
      : {}),
  }));

  const departments = new Map<string, Set<string>>();
  for (const place of places) {
    if (!place.country || !place.city || !place.department) continue;
    const key = `${place.country}\u0000${place.city}`;
    const set = departments.get(key) ?? new Set<string>();
    set.add(place.department);
    departments.set(key, set);
  }
  const geography = [...departments.entries()].map(([key, set]) => {
    const [country, city] = key.split('\u0000');
    return { country, city, departments: [...set].sort() };
  });

  return {
    schemaVersion: 1,
    source: input.source,
    licenseClass: input.licenseClass ?? 'OWNED',
    geography,
    places,
    activities,
  };
}
