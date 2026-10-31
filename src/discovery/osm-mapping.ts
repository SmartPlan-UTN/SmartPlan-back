/**
 * OpenStreetMap element → SmartPlan identity (kind) and factual context
 * hints. Pure and offline: the input is one element of an Overpass export
 * (ODbL), the output never claims more than its tags say.
 */
import type { PlaceKind } from '../catalog/taxonomy';
import { normalizeName } from '../catalog/catalog-dedupe';

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  version?: number;
  timestamp?: string;
  tags?: Record<string, string>;
}

export interface OsmVenue {
  osmType: OverpassElement['type'];
  osmId: string;
  version: number | null;
  timestamp: string | null;
  name: string;
  latitude: number;
  longitude: number;
  tags: Record<string, string>;
  kind: PlaceKind;
}

/** Mendoza province bounding box (with a small margin). */
const MENDOZA = { south: -37.7, north: -32.0, west: -70.7, east: -66.4 };

const has = (tags: Record<string, string>, key: string, pattern: RegExp) =>
  pattern.test(tags[key] ?? '');

/**
 * The SmartPlan kind of an element, or null when SmartPlan cannot plan it
 * (a gym, a generic "attraction", a wine shop, a church).
 */
export function osmKind(tags: Record<string, string>): PlaceKind | null {
  const amenity = tags.amenity ?? '';
  const name = normalizeName(tags.name ?? '');
  if (amenity === 'restaurant' || amenity === 'food_court') {
    // A brewery restaurant is a brewery; a "cervecería" by name too.
    if (has(tags, 'microbrewery', /^yes$/) || /\bcerveceri/.test(name))
      return 'brewery';
    return 'restaurant';
  }
  if (amenity === 'fast_food') return 'restaurant';
  if (amenity === 'cafe') return 'cafe';
  if (amenity === 'ice_cream' || tags.shop === 'ice_cream') return 'ice_cream';
  if (amenity === 'bar' || amenity === 'pub') {
    if (has(tags, 'microbrewery', /^yes$/) || /\bcerveceri/.test(name))
      return 'brewery';
    return 'bar';
  }
  if (amenity === 'biergarten') return 'brewery';
  if (amenity === 'nightclub') return 'nightclub';
  if (amenity === 'cinema') return 'cinema';
  if (amenity === 'theatre') return 'theatre';
  if (amenity === 'arts_centre') return 'cultural_center';
  if (amenity === 'casino') return 'amusement';
  if (amenity === 'spa' || tags.leisure === 'spa') return 'spa';
  if (tags.tourism === 'museum') return 'museum';
  if (tags.tourism === 'gallery') return 'cultural_center';
  if (tags.tourism === 'viewpoint') return 'viewpoint';
  if (tags.tourism === 'zoo' || tags.tourism === 'aquarium') return 'zoo';
  if (tags.tourism === 'theme_park') return 'amusement';
  if (tags.craft === 'winery' || tags.tourism === 'wine_cellar')
    return 'winery';
  if (
    [
      'bowling_alley',
      'amusement_arcade',
      'escape_game',
      'water_park',
      'miniature_golf',
      'trampoline_park',
    ].includes(tags.leisure ?? '')
  )
    return 'amusement';
  if (has(tags, 'sport', /karting/)) return 'amusement';
  if (tags.leisure === 'nature_reserve') return 'nature_reserve';
  if (tags.leisure === 'park') return 'park';
  if (
    ['horse_riding'].includes(tags.leisure ?? '') ||
    tags.tourism === 'trail_riding_station' ||
    has(tags, 'sport', /rafting|canoe|paragliding/)
  )
    return 'adventure_operator';
  if (tags.leisure === 'climbing' || has(tags, 'sport', /climbing/))
    return 'sports_venue';
  if (
    ['bakery', 'pastry', 'confectionery', 'chocolate'].includes(tags.shop ?? '')
  )
    return 'bakery';
  if (tags.natural === 'hot_spring') return 'hot_springs';
  return null;
}

export function osmVenue(element: OverpassElement): OsmVenue | null {
  const tags = element.tags ?? {};
  const name = (tags.name ?? '').trim();
  if (name.length < 2 || name.length > 200) return null;
  // Closed or not-yet-open venues are not venues.
  if (
    Object.keys(tags).some((key) =>
      /^(disused|abandoned|was|demolished|razed|removed):/.test(key),
    ) ||
    has(tags, 'opening_hours', /^closed$/i)
  )
    return null;
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  if (latitude === undefined || longitude === undefined) return null;
  if (
    latitude < MENDOZA.south ||
    latitude > MENDOZA.north ||
    longitude < MENDOZA.west ||
    longitude > MENDOZA.east
  )
    return null;
  const kind = osmKind(tags);
  if (!kind) return null;
  return {
    osmType: element.type,
    osmId: String(element.id),
    version: element.version ?? null,
    timestamp: element.timestamp ?? null,
    name,
    latitude: Number(latitude.toFixed(6)),
    longitude: Number(longitude.toFixed(6)),
    tags,
    kind,
  };
}

export interface TagHint {
  trait: string;
  score: number;
  /** What in the tags says it ("cuisine=burger"). */
  evidence: string;
}

/**
 * Factual context hints from an element's own tags: what it serves and
 * offers, never how it "feels". `trendy`/`traditional` are only hinted by
 * formats the tags name explicitly (cocktails, craft beer, a fast-food
 * counter), with low weight; the ranking treats them as weak evidence.
 */
export function osmTagHints(tags: Record<string, string>): TagHint[] {
  const hints: TagHint[] = [];
  const cuisine = (tags.cuisine ?? '').toLowerCase();
  const push = (trait: string, score: number, evidence: string) =>
    hints.push({ trait, score, evidence });
  if (tags.amenity === 'fast_food') {
    push('fast_food', 1, 'amenity=fast_food');
    push('casual', 0.6, 'amenity=fast_food');
    push('trendy', -0.5, 'amenity=fast_food');
    push('romantic', -0.6, 'amenity=fast_food');
  }
  if (/hot_dog/.test(cuisine)) push('trendy', -0.6, `cuisine=${cuisine}`);
  if (/burger/.test(cuisine)) push('casual', 0.5, `cuisine=${cuisine}`);
  if (/pizza|burger|tapas|empanada|sandwich|kebab|chicken/.test(cuisine))
    push('sharing_food', 0.4, `cuisine=${cuisine}`);
  if (/tapas/.test(cuisine)) push('sharing_food', 0.7, `cuisine=${cuisine}`);
  if (/regional|argentinian|asado|steak_house|grill/.test(cuisine))
    push('traditional', 0.4, `cuisine=${cuisine}`);
  if (
    /vegetarian|vegan/.test(cuisine) ||
    /^(yes|only)$/.test(tags['diet:vegetarian'] ?? '')
  )
    push('vegetarian_friendly', 0.8, 'diet:vegetarian');
  if (
    tags.cocktails === 'yes' ||
    tags['drink:cocktail'] === 'yes' ||
    /cocktail/.test(cuisine)
  ) {
    push('cocktails', 0.9, 'cocktails=yes');
    push('trendy', 0.4, 'cocktails=yes');
  }
  if (tags.microbrewery === 'yes' || tags['drink:craft_beer'] === 'yes') {
    push('craft_beer', 0.9, 'microbrewery=yes');
    push('good_for_groups', 0.4, 'microbrewery=yes');
  }
  if (tags.amenity === 'biergarten') {
    push('craft_beer', 0.6, 'amenity=biergarten');
    push('outdoor_seating', 0.8, 'amenity=biergarten');
    push('good_for_groups', 0.6, 'amenity=biergarten');
  }
  if (tags['drink:wine'] === 'yes' || /wine/.test(cuisine))
    push('wine_focus', 0.6, 'drink:wine=yes');
  if (tags.outdoor_seating === 'yes')
    push('outdoor_seating', 0.9, 'outdoor_seating=yes');
  if (tags.live_music === 'yes') push('live_music', 0.9, 'live_music=yes');
  if (/coffee_shop|coffee/.test(cuisine))
    push('merienda', 0.4, `cuisine=${cuisine}`);
  if (/ice_cream|dessert|cake|crepe/.test(cuisine))
    push('dessert_focus', 0.6, `cuisine=${cuisine}`);
  if (tags.brunch === 'yes' || /brunch/.test(cuisine))
    push('brunch', 0.8, 'brunch=yes');
  return hints;
}
