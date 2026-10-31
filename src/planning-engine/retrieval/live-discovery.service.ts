import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import type { PlaceTrait } from '../../catalog/place-actionability';
import { GoogleMapsClientService } from '../../external-integration/google-maps/google-maps-client.service';
import {
  EXPERIENCE_QUERIES,
  INTENT_CONCEPTS,
} from '../../discovery/discovery-matrix';
import type { ExperienceKey } from '../intent/experiences';
import type { PlanIntent } from '../intent/plan-intent';
import { APPLY_CONFIDENCE, FOOD_KEYWORDS, facetKey } from '../intent/semantics';
import { normalizeSearchText } from '../../recommendation/local-intent';

/** One live query and the traits its words stand for. */
export interface LiveQuery {
  text: string;
  concept: string;
  traits: PlaceTrait[];
  experiences: ExperienceKey[];
}

export interface LiveHit {
  /** Best (lowest) position across queries, 0-based. */
  position: number;
  concepts: Set<string>;
  traits: Set<PlaceTrait>;
  experiences: Set<ExperienceKey>;
}

export interface LiveDiscovery {
  hits: Map<string, LiveHit>;
  queries: string[];
  durationMs: number;
  skipped: 'disabled' | 'error' | null;
}

const MAX_QUERIES = 4;
const LIVE_TIMEOUT_MS = 2500;

export const EMPTY_LIVE_DISCOVERY: LiveDiscovery = {
  hits: new Map(),
  queries: [],
  durationMs: 0,
  skipped: 'disabled',
};

/**
 * Specific things a person names (a dish, a drink, a format): the live
 * search asks for exactly that first ("vermú" → "vermutería").
 */
const SPECIFIC_QUERIES: {
  pattern: RegExp;
  query: string;
  traits: PlaceTrait[];
}[] = [
  {
    pattern: /\b(vermu|vermut|vermouth|vermuteria)\b/,
    query: 'vermutería',
    traits: ['cocktails'],
  },
  { pattern: /\b(sushi|rolls?)\b/, query: 'sushi', traits: [] },
  {
    pattern: /\b(hamburguesas?|burgers?|hamburgueseria)\b/,
    query: 'hamburguesería',
    traits: [],
  },
  { pattern: /\b(pizzas?|pizzeria)\b/, query: 'pizzería', traits: [] },
  {
    pattern: /\b(cocteles|cocktails?|cocteleria|tragos de autor)\b/,
    query: 'coctelería',
    traits: ['cocktails'],
  },
  {
    pattern: /\b(musica en vivo|con musica|banda en vivo)\b/,
    query: 'bar con música en vivo',
    traits: ['live_music'],
  },
  {
    pattern: /\b(cerveza artesanal|cerveceria|birra)\b/,
    query: 'cervecería artesanal',
    traits: ['craft_beer'],
  },
  { pattern: /\b(parrilla|asado)\b/, query: 'parrilla', traits: [] },
  {
    pattern: /\b(bar de vinos|vinoteca|copa de vino)\b/,
    query: 'bar de vinos',
    traits: ['wine_focus'],
  },
  { pattern: /\b(brunch)\b/, query: 'brunch', traits: ['brunch'] },
  { pattern: /\b(helados?|heladeria)\b/, query: 'heladería', traits: [] },
  {
    pattern: /\b(rooftop|terraza)\b/,
    query: 'rooftop terraza bar',
    traits: ['view'],
  },
  {
    pattern: /\b(picada|picar|tapas)\b/,
    query: 'picadas para compartir',
    traits: ['sharing_food'],
  },
];

/**
 * What each wanted facet is asked as in a live search. The words are
 * SmartPlan's, never the person's slang ("fachero" → "bar moderno").
 */
const FACET_QUERIES: Record<string, { query: string; traits: PlaceTrait[] }> = {
  'food_drink.vermouth': { query: 'vermutería', traits: ['cocktails'] },
  'food_drink.cocktails': { query: 'coctelería', traits: ['cocktails'] },
  'food_drink.craft_beer': {
    query: 'cervecería artesanal',
    traits: ['craft_beer'],
  },
  'food_drink.wine': { query: 'bar de vinos', traits: ['wine_focus'] },
  'food_drink.sushi': { query: 'sushi', traits: [] },
  'food_drink.burgers': { query: 'hamburguesería', traits: [] },
  'food_drink.pizza': { query: 'pizzería', traits: [] },
  'food_drink.pasta': { query: 'pastas', traits: [] },
  'food_drink.sharing_food': {
    query: 'picadas para compartir',
    traits: ['sharing_food'],
  },
  'social.live_music': {
    query: 'bar con música en vivo',
    traits: ['live_music'],
  },
  'social.music': { query: 'bar con música en vivo', traits: ['live_music'] },
  'style.rooftop': {
    query: 'rooftop terraza bar',
    traits: ['view', 'outdoor_seating'],
  },
  'style.garden': {
    query: 'bar con jardín patio',
    traits: ['outdoor_seating'],
  },
  'style.cozy': { query: 'bar acogedor', traits: ['intimate'] },
  'style.rustic': { query: 'lugar rústico', traits: ['traditional'] },
  'style.artsy': { query: 'bar cultural artístico', traits: ['trendy'] },
  'style.alternative': { query: 'bar alternativo', traits: ['trendy'] },
  'style.elegant': { query: 'lugar elegante', traits: ['premium'] },
};

/** The person's idea as a few live search phrases (SmartPlan's words). */
export function liveQueries(
  intent: PlanIntent,
  experiences: ExperienceKey[],
  zone: string,
  rawQuery: string | null = null,
): LiveQuery[] {
  const queries: LiveQuery[] = [];
  const text = normalizeSearchText(rawQuery ?? '');
  const refused = (query: string) =>
    (intent.avoidKeywords ?? []).some((word) =>
      normalizeSearchText(query).includes(word),
    ) ||
    Object.entries(FOOD_KEYWORDS).some(
      ([food, words]) =>
        (intent.facets ?? []).some(
          (facet) =>
            facet.polarity === 'avoid' &&
            facet.dimension === 'food_drink' &&
            facet.value === food,
        ) && words.some((word) => normalizeSearchText(query).includes(word)),
    );
  const wantedFacets = (intent.facets ?? []).filter(
    (facet) =>
      facet.polarity === 'want' && facet.confidence >= APPLY_CONFIDENCE,
  );
  const drinkingOut = experiences.some(
    (key) => key === 'drinks' || key === 'beer',
  );
  // A quiet chat is a different search from a night out.
  if (
    drinkingOut &&
    wantedFacets.some(
      (facet) =>
        facetKey(facet) === 'social.conversation_friendly' ||
        facetKey(facet) === 'energy.quiet',
    )
  )
    queries.push({
      text: `bar tranquilo para charlar ${zone}`,
      concept: 'facet:quiet_talk',
      traits: ['quiet'],
      experiences,
    });
  for (const facet of wantedFacets) {
    const wording = FACET_QUERIES[facetKey(facet)];
    if (wording && !refused(wording.query))
      queries.push({
        text: `${wording.query} ${zone}`,
        concept: `facet:${facetKey(facet)}`,
        traits: wording.traits,
        experiences,
      });
  }
  for (const specific of SPECIFIC_QUERIES)
    if (specific.pattern.test(text) && !refused(specific.query))
      queries.push({
        text: `${specific.query} ${zone}`,
        concept: `specific:${specific.query}`,
        traits: specific.traits,
        experiences,
      });
  // Refused moods never steer the search ("no boliche": no nightlife).
  const wanted = new Set<PlaceTrait>(
    intent.vibe.filter((trait) => !intent.avoid.includes(trait)),
  );
  const conceptKeys = new Set<string>();
  for (const concept of INTENT_CONCEPTS)
    if (concept.traits.some((trait) => wanted.has(trait)))
      conceptKeys.add(concept.key);
  if (intent.occasion === 'romantic' || intent.occasion === 'first_date')
    conceptKeys.add('romantic');
  if (intent.occasion === 'friends') conceptKeys.add('friends');
  if (intent.pricePreference === 'premium') conceptKeys.add('premium');
  if (intent.pricePreference === 'cheap') conceptKeys.add('cheap');
  const drinkish = experiences.some(
    (key) => key === 'drinks' || key === 'beer',
  );
  for (const concept of INTENT_CONCEPTS) {
    if (!conceptKeys.has(concept.key)) continue;
    // "Con onda" for a drink is a bar; for a dinner, a restaurant.
    const text =
      concept.key === 'trendy' && !drinkish
        ? 'restaurante moderno con onda'
        : concept.key === 'friends' && !drinkish
          ? 'restaurante para ir con amigos'
          : concept.queries[0];
    queries.push({
      text: `${text} ${zone}`,
      concept: concept.key,
      traits: concept.traits,
      experiences,
    });
  }
  for (const key of experiences)
    for (const text of (EXPERIENCE_QUERIES[key] ?? []).slice(0, 1))
      queries.push({
        text: `${text} ${zone}`,
        concept: `experience:${key}`,
        traits: [],
        experiences: [key],
      });
  return queries
    .filter(
      (query, index, list) =>
        list.findIndex((other) => other.text === query.text) === index,
    )
    .slice(0, MAX_QUERIES);
}

/**
 * Request-scoped live discovery: a few ID-only Text Searches (the free,
 * unlimited SKU) for the person's own idea. The result is used only for
 * this request, as an external relevance signal on venues SmartPlan
 * already knows; IDs SmartPlan does not know yet are recorded (the ID only)
 * so the offline resolver can give them a durable identity.
 */
@Injectable()
export class LiveDiscoveryService {
  private readonly logger = new Logger(LiveDiscoveryService.name);

  constructor(
    private readonly googleMaps: GoogleMapsClientService,
    private readonly dataSource: DataSource,
    @Optional() private readonly configuration?: ConfigService,
  ) {}

  private enabled(): boolean {
    const value: unknown = this.configuration?.get(
      'PLANNING_LIVE_DISCOVERY_ENABLED',
    );
    return !(value === false || value === 'false' || value === '0');
  }

  async discover(queries: LiveQuery[]): Promise<LiveDiscovery> {
    if (!queries.length || !this.enabled()) return EMPTY_LIVE_DISCOVERY;
    const startedAt = Date.now();
    const signal = AbortSignal.timeout(LIVE_TIMEOUT_MS);
    const hits = new Map<string, LiveHit>();
    let failures = 0;
    await Promise.all(
      queries.map(async (query) => {
        try {
          const { ids } = await this.googleMaps.searchPlaceIds(query.text, {
            pageSize: 20,
            signal,
          });
          ids.forEach((id, position) => {
            const hit = hits.get(id) ?? {
              position,
              concepts: new Set<string>(),
              traits: new Set<PlaceTrait>(),
              experiences: new Set<ExperienceKey>(),
            };
            hit.position = Math.min(hit.position, position);
            hit.concepts.add(query.concept);
            for (const trait of query.traits) hit.traits.add(trait);
            for (const key of query.experiences) hit.experiences.add(key);
            hits.set(id, hit);
          });
        } catch (error) {
          failures += 1;
          this.logger.warn(
            `Live discovery failed for "${query.text}": ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }),
    );
    void this.record([...hits.keys()], queries).catch(() => undefined);
    return {
      hits,
      queries: queries.map((query) => query.text),
      durationMs: Date.now() - startedAt,
      skipped: failures === queries.length ? 'error' : null,
    };
  }

  /** IDs only, with SmartPlan's cell names; never Google's order. */
  private async record(ids: string[], queries: LiveQuery[]): Promise<void> {
    if (!ids.length) return;
    const cells = [...new Set(queries.map((query) => `live:${query.concept}`))];
    await this.dataSource.query(
      `INSERT INTO google_place_discovery (google_place_id, first_seen_at, last_seen_at, hits, cells)
       SELECT id, now(), now(), 1, $2::text[] FROM unnest($1::text[]) AS id
       ON CONFLICT (google_place_id) WHERE deleted_at IS NULL DO UPDATE
         SET last_seen_at = now(), hits = google_place_discovery.hits + 1,
             cells = ARRAY(SELECT DISTINCT unnest(google_place_discovery.cells || $2::text[]))`,
      [ids, cells],
    );
  }
}
