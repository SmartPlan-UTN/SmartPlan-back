/**
 * The discovery matrix: SmartPlan's own cells (zone × category, and intent
 * concepts) used for ID-only discovery. Queries are SmartPlan's words; what
 * Google returns for them is a relevance signal, never stored as ranking.
 */
import type { PlaceTrait } from '../catalog/place-actionability';
import type { ExperienceKey } from '../planning-engine/intent/experiences';

export interface DiscoveryZone {
  key: string;
  label: string;
  centre: { latitude: number; longitude: number };
  radiusMeters: number;
}

export const DISCOVERY_ZONES: DiscoveryZone[] = [
  {
    key: 'ciudad',
    label: 'Ciudad de Mendoza',
    centre: { latitude: -32.8895, longitude: -68.8458 },
    radiusMeters: 3000,
  },
  {
    key: 'godoy-cruz',
    label: 'Godoy Cruz Mendoza',
    centre: { latitude: -32.9255, longitude: -68.8445 },
    radiusMeters: 4000,
  },
  {
    key: 'guaymallen',
    label: 'Guaymallén Mendoza',
    centre: { latitude: -32.9, longitude: -68.79 },
    radiusMeters: 5000,
  },
  {
    key: 'las-heras',
    label: 'Las Heras Mendoza',
    centre: { latitude: -32.85, longitude: -68.82 },
    radiusMeters: 5000,
  },
  {
    key: 'chacras',
    label: 'Chacras de Coria',
    centre: { latitude: -32.997, longitude: -68.873 },
    radiusMeters: 2500,
  },
  {
    key: 'lujan',
    label: 'Luján de Cuyo',
    centre: { latitude: -33.036, longitude: -68.878 },
    radiusMeters: 8000,
  },
  {
    key: 'maipu',
    label: 'Maipú Mendoza',
    centre: { latitude: -32.983, longitude: -68.786 },
    radiusMeters: 8000,
  },
  {
    key: 'valle-de-uco',
    label: 'Valle de Uco',
    centre: { latitude: -33.55, longitude: -69.1 },
    radiusMeters: 30000,
  },
  {
    key: 'tunuyan',
    label: 'Tunuyán',
    centre: { latitude: -33.577, longitude: -69.015 },
    radiusMeters: 12000,
  },
  {
    key: 'tupungato',
    label: 'Tupungato',
    centre: { latitude: -33.37, longitude: -69.15 },
    radiusMeters: 12000,
  },
  {
    key: 'san-carlos',
    label: 'San Carlos Mendoza',
    centre: { latitude: -33.774, longitude: -69.048 },
    radiusMeters: 12000,
  },
  {
    key: 'san-rafael',
    label: 'San Rafael Mendoza',
    centre: { latitude: -34.6177, longitude: -68.3301 },
    radiusMeters: 15000,
  },
  {
    key: 'potrerillos',
    label: 'Potrerillos Mendoza',
    centre: { latitude: -32.96, longitude: -69.2 },
    radiusMeters: 10000,
  },
  {
    key: 'cacheuta',
    label: 'Cacheuta',
    centre: { latitude: -33.02, longitude: -69.12 },
    radiusMeters: 6000,
  },
];

export interface DiscoveryCategory {
  key: string;
  query: string;
}

export const DISCOVERY_CATEGORIES: DiscoveryCategory[] = [
  { key: 'restaurant', query: 'restaurante' },
  { key: 'cafe', query: 'café' },
  { key: 'brunch', query: 'brunch' },
  { key: 'merienda', query: 'merienda pastelería' },
  { key: 'bar', query: 'bar' },
  { key: 'cocktail', query: 'bar de tragos cocteles' },
  { key: 'vermuteria', query: 'vermutería' },
  { key: 'brewery', query: 'cervecería' },
  { key: 'wine-bar', query: 'bar de vinos' },
  { key: 'ice-cream', query: 'heladería' },
  { key: 'burger', query: 'hamburguesería' },
  { key: 'pizza', query: 'pizzería' },
  { key: 'sushi', query: 'sushi' },
  { key: 'parrilla', query: 'parrilla' },
  { key: 'nightclub', query: 'boliche' },
  { key: 'live-music', query: 'música en vivo' },
  { key: 'rooftop', query: 'rooftop terraza' },
  { key: 'museum', query: 'museo' },
  { key: 'theatre', query: 'teatro' },
  { key: 'cinema', query: 'cine' },
  { key: 'gallery', query: 'galería de arte centro cultural' },
  { key: 'spa', query: 'spa' },
  { key: 'thermal', query: 'termas' },
  { key: 'bowling', query: 'bowling' },
  { key: 'escape-room', query: 'escape room' },
  { key: 'karting', query: 'karting' },
  { key: 'arcade', query: 'juegos arcade' },
  { key: 'horseback', query: 'cabalgata' },
  { key: 'rafting', query: 'rafting' },
  { key: 'trekking', query: 'trekking' },
  { key: 'bike', query: 'alquiler de bicicletas' },
  { key: 'adventure', query: 'turismo aventura' },
  { key: 'winery', query: 'bodega' },
  { key: 'wine-tasting', query: 'degustación de vinos' },
  { key: 'winery-lunch', query: 'almuerzo en bodega' },
  { key: 'kids', query: 'actividades para niños' },
  { key: 'viewpoint', query: 'mirador' },
];

/**
 * Intent concepts: what a vague human idea means as retrieval concepts.
 * Each concept names SmartPlan traits that would evidence it and the words
 * used for a live ID-only search. The search result says "Google thinks
 * this venue matches these words" (request-scoped), not that it does.
 */
export interface IntentConcept {
  key: string;
  traits: PlaceTrait[];
  queries: string[];
}

export const INTENT_CONCEPTS: IntentConcept[] = [
  {
    key: 'trendy',
    traits: ['trendy'],
    queries: ['bar con onda', 'lugar moderno para tomar algo', 'bar de moda'],
  },
  {
    key: 'romantic',
    traits: ['romantic', 'intimate'],
    queries: ['cena romántica', 'restaurante romántico'],
  },
  {
    key: 'friends',
    traits: ['good_for_groups', 'lively'],
    queries: ['cervecería con amigos', 'bar para ir con amigos'],
  },
  {
    key: 'premium',
    traits: ['premium'],
    queries: ['restaurante de alta cocina', 'restaurante premium'],
  },
  {
    key: 'cheap',
    traits: ['good_value'],
    queries: ['comer barato', 'restaurante económico'],
  },
  {
    key: 'cocktails',
    traits: ['cocktails'],
    queries: ['bar de cocteles', 'coctelería'],
  },
  {
    key: 'live_music',
    traits: ['live_music'],
    queries: ['bar con música en vivo'],
  },
  {
    key: 'traditional',
    traits: ['traditional'],
    queries: ['bodegón tradicional', 'restaurante clásico'],
  },
];

/** Live queries per experience when the person gave no vibe words. */
export const EXPERIENCE_QUERIES: Partial<Record<ExperienceKey, string[]>> = {
  dinner: ['restaurante para cenar'],
  lunch: ['restaurante para almorzar'],
  drinks: ['bar para tomar algo', 'bar de tragos'],
  beer: ['cervecería artesanal'],
  merienda: ['lugar lindo para merendar', 'café para merendar'],
  brunch: ['brunch'],
  dessert: ['heladería', 'postres'],
  dancing: ['boliche para bailar'],
  family_fun: ['actividades para chicos', 'entretenimiento familiar'],
  fun: ['bowling escape room karting', 'entretenimiento'],
  culture: ['centro cultural', 'museo'],
  wellness: ['spa', 'termas'],
  adventure: ['turismo aventura', 'rafting'],
  show: ['espectáculo en vivo', 'teatro'],
};

/** Starter canaries (validation, not data): their identity is their own name query. */
export const CANARIES: {
  name: string;
  identityQuery: string;
  /** How many branches to take from the identity query. */
  branches?: number;
  intentQueries: string[];
}[] = [
  {
    name: 'Burgang',
    identityQuery: 'Burgang Mendoza',
    branches: 3,
    intentQueries: [
      'hamburguesas con amigos Mendoza',
      'hamburguesería Mendoza',
    ],
  },
  {
    name: 'La Central Vermutería',
    identityQuery: 'La Central Vermutería Mendoza',
    intentQueries: ['vermutería Mendoza', 'bar con onda Mendoza'],
  },
  {
    name: 'La Feliz',
    identityQuery: 'La Feliz bar Mendoza',
    intentQueries: ['bar con onda Mendoza', 'bar de tragos Mendoza'],
  },
  {
    name: 'Flores en Fuego',
    identityQuery: 'Flores en Fuego Mendoza',
    intentQueries: ['bar con onda Mendoza', 'restaurante moderno Mendoza'],
  },
  {
    name: 'Refugio Patagonia',
    identityQuery: 'Refugio Patagonia Mendoza',
    branches: 2,
    intentQueries: ['cervecería con amigos Mendoza', 'cervecería Mendoza'],
  },
  {
    name: 'Barijho',
    identityQuery: 'Barijho Mendoza',
    branches: 3,
    intentQueries: ['cervecería con amigos Mendoza', 'bar con onda Mendoza'],
  },
];
