/**
 * Areas people name that are not one department: "Valle de Uco" spans three,
 * "Gran Mendoza" six. A region centres the search on its departments.
 * Department names must match the seeded `department.name` values.
 */
export interface RegionDefinition {
  label: string;
  /** Membership: a candidate must be in one of these departments. */
  departments: readonly string[];
  /**
   * Where people mean when they name the region (the wine area of Valle de
   * Uco, not the average of every remote site in its departments). Used to
   * measure travel, never shown as a place.
   */
  centre: { latitude: number; longitude: number };
}

export const REGIONS = {
  mendoza: {
    label: 'Mendoza',
    // The departments currently represented by the local Mendoza catalog.
    // As coverage grows, add the new department here so "por Mendoza" keeps
    // searching the whole catalog area instead of falling back to profile GPS.
    departments: [
      'Ciudad de Mendoza',
      'Godoy Cruz',
      'Guaymallén',
      'Las Heras',
      'Luján de Cuyo',
      'Maipú',
      'San Carlos',
      'San Rafael',
      'Tunuyán',
      'Tupungato',
    ],
    centre: { latitude: -33.65, longitude: -68.75 },
  },
  valle_de_uco: {
    label: 'Valle de Uco',
    departments: ['Tunuyán', 'Tupungato', 'San Carlos'],
    centre: { latitude: -33.55, longitude: -69.17 },
  },
  gran_mendoza: {
    label: 'Gran Mendoza',
    departments: [
      'Ciudad de Mendoza',
      'Godoy Cruz',
      'Guaymallén',
      'Las Heras',
      'Luján de Cuyo',
      'Maipú',
    ],
    centre: { latitude: -32.89, longitude: -68.84 },
  },
  alta_montana: {
    label: 'Alta montaña',
    departments: ['Las Heras', 'Luján de Cuyo'],
    centre: { latitude: -32.83, longitude: -69.55 },
  },
  sur: {
    label: 'Sur mendocino',
    departments: ['San Rafael', 'General Alvear', 'Malargüe'],
    centre: { latitude: -34.62, longitude: -68.33 },
  },
} as const satisfies Record<string, RegionDefinition>;

export type RegionKey = keyof typeof REGIONS;

const REGION_PATTERNS: { region: RegionKey; pattern: RegExp }[] = [
  { region: 'valle_de_uco', pattern: /\bvalle de uco\b/ },
  { region: 'gran_mendoza', pattern: /\bgran mendoza\b/ },
  { region: 'alta_montana', pattern: /\balta montana\b/ },
  { region: 'sur', pattern: /\b(sur mendocino|el sur de mendoza)\b/ },
  { region: 'mendoza', pattern: /\bmendoza\b/ },
];

/** The region named in normalised text, if any. */
export function regionInText(text: string): RegionKey | null {
  return (
    REGION_PATTERNS.find(({ pattern }) => pattern.test(text))?.region ?? null
  );
}

export function isRegionKey(value: unknown): value is RegionKey {
  return typeof value === 'string' && Object.hasOwn(REGIONS, value);
}

/**
 * Localities people name that are an area inside a department, not the
 * department ("Chacras" is a few blocks of Luján de Cuyo, "Potrerillos" its
 * mountains): the search is a point and a radius around where people mean.
 */
export interface LocalityDefinition {
  label: string;
  centre: { latitude: number; longitude: number };
  radiusKm: number;
  /** What "algo para hacer" means there when nothing else is named. */
  defaults?: readonly import('./experiences').ExperienceKey[];
}

const LOCALITIES: { pattern: RegExp; locality: LocalityDefinition }[] = [
  {
    pattern: /\bchacras(?: de coria)?\b/,
    locality: {
      label: 'Chacras de Coria',
      centre: { latitude: -32.997, longitude: -68.873 },
      radiusKm: 3,
    },
  },
  {
    pattern: /\bpotrerillos\b/,
    locality: {
      label: 'Potrerillos',
      centre: { latitude: -32.96, longitude: -69.2 },
      radiusKm: 15,
      // Rafting/kayak only once real offerings exist; lunch with the dam view.
      defaults: ['lunch'],
    },
  },
  {
    pattern: /\bcacheuta\b/,
    locality: {
      label: 'Cacheuta',
      centre: { latitude: -33.02, longitude: -69.12 },
      radiusKm: 8,
      defaults: ['wellness', 'lunch'],
    },
  },
  {
    pattern: /\b(la carrodilla|carrodilla)\b/,
    locality: {
      label: 'Carrodilla',
      centre: { latitude: -32.96, longitude: -68.86 },
      radiusKm: 3,
    },
  },
];

/** The locality named in normalised text, if any. */
export function localityInText(text: string): LocalityDefinition | null {
  return LOCALITIES.find(({ pattern }) => pattern.test(text))?.locality ?? null;
}
