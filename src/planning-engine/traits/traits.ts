/**
 * Contextual traits of a candidate ("romantic", "lively", "good value"),
 * gathered from evidence in increasing order of trust:
 *
 * - PRIOR: what the kind usually is (a brewery is usually lively). Weak,
 *   only orders candidates; never quoted to the person.
 * - DESCRIPTION: words in SmartPlan's own description of the place or
 *   offering ("con vista a la montaña"), quoted as evidence.
 * - CURATED / MENU_DERIVED / LLM_FROM_EVIDENCE / COMMUNITY: stored traits
 *   (place_trait), each with its source and confidence.
 */
import {
  type MealMoment,
  type PlaceTrait,
  type TraitVector,
  planningOfKind,
} from '../../catalog/place-actionability';
import { normalizeSearchText } from '../../recommendation/local-intent';
import type { TraitEvidence, TraitSource } from '../candidate';

const PRIOR_CONFIDENCE = 0.3;
const DESCRIPTION_CONFIDENCE = 0.6;

/** Trust of each source when several speak about the same trait. */
export const TRAIT_SOURCE_WEIGHT: Record<TraitSource, number> = {
  PRIOR: 0.3,
  NAME: 0.45,
  DESCRIPTION: 0.6,
  LLM_FROM_EVIDENCE: 0.6,
  MENU_DERIVED: 0.7,
  CURATED: 0.9,
  COMMUNITY: 0.85,
  OPEN_DATA: 0.55,
  LIVE_RELEVANCE: 0.5,
};

/** Sources strong enough to be quoted in "por qué encaja". */
export const QUOTABLE_TRAIT_SOURCES: ReadonlySet<TraitSource> = new Set([
  'DESCRIPTION',
  'CURATED',
  'MENU_DERIVED',
  'LLM_FROM_EVIDENCE',
  'COMMUNITY',
]);

const DESCRIPTION_RULES: { trait: PlaceTrait; pattern: RegExp }[] = [
  {
    trait: 'romantic',
    pattern: /\b(romantic[oa]s?|para parejas|enamorad\w*)\b/,
  },
  { trait: 'intimate', pattern: /\b(intim[oa]s?|pocas mesas|acogedor[a]?)\b/ },
  {
    trait: 'quiet',
    pattern: /\b(tranquil[oa]s?|silencios[oa]s?|calm[oa]s?|relajad[oa]s?)\b/,
  },
  {
    trait: 'lively',
    pattern: /\b(animad[oa]s?|bullicios[oa]s?|movid[oa]s?|after|dj)\b/,
  },
  {
    trait: 'view',
    pattern:
      /\b(vista|vistas|panoramic[oa]s?|mirador|cordillera|vista a la montana)\b/,
  },
  {
    trait: 'outdoor_seating',
    pattern: /\b(terraza|patio|jardin|al aire libre|vereda)\b/,
  },
  {
    trait: 'live_music',
    pattern: /\b(musica en vivo|shows? en vivo|bandas? en vivo)\b/,
  },
  {
    trait: 'craft_beer',
    pattern:
      /\b(cerveza artesanal|cervezas artesanales|birra artesanal|ipa|tirada)\b/,
  },
  {
    trait: 'wine_focus',
    pattern: /\b(vinos?|malbec|carta de vinos|maridaje|sommelier|bodega)\b/,
  },
  { trait: 'brunch', pattern: /\bbrunch\b/ },
  {
    trait: 'merienda',
    pattern: /\b(merienda|meriendas|tortas|pasteleria|facturas)\b/,
  },
  {
    trait: 'family_friendly',
    pattern: /\b(familia|familias|familiar|ninos|chicos|infantil)\b/,
  },
  {
    trait: 'vegetarian_friendly',
    pattern: /\b(vegetarian[oa]s?|vegan[oa]s?|veggie|sin tacc)\b/,
  },
  {
    trait: 'premium',
    pattern:
      /\b(menu de pasos|tres tiempos|de autor|alta cocina|degustacion|fine dining)\b/,
  },
  {
    trait: 'good_value',
    pattern:
      /\b(economic[oa]s?|precios accesibles|menu ejecutivo|promo|promocion)\b/,
  },
  {
    trait: 'good_for_groups',
    pattern: /\b(amigos|grupos|para compartir|picadas?|tablas?)\b/,
  },
  {
    trait: 'late_night',
    pattern: /\b(hasta tarde|trasnoche|madrugada|after)\b/,
  },
  {
    trait: 'casual',
    pattern: /\b(informal|descontracturad[oa]|al paso|rapid[oa]s?)\b/,
  },
];

/**
 * Format words in a venue's name say what kind of place it is ("Bistró",
 * "Parrilla", "Cervecería", "Pizzería"). They are generic semantic
 * features, never exceptions for a named place, and weak (not quoted).
 */
const NAME_RULES: { pattern: RegExp; traits: [PlaceTrait, number][] }[] = [
  {
    pattern: /\b(casino|casinos|tragamonedas|sala de apuestas)\b/,
    traits: [['family_friendly', -1]],
  },
  {
    pattern: /\b(bistro|wine bar|vinoteca|enoteca|trattoria|osteria)\b/,
    traits: [
      ['romantic', 0.5],
      ['intimate', 0.5],
      ['wine_focus', 0.4],
    ],
  },
  {
    pattern: /\b(cocina de autor|restaurante de autor|fine dining)\b/,
    traits: [
      ['premium', 0.7],
      ['romantic', 0.4],
    ],
  },
  {
    pattern: /\b(parrilla|parrillada|asador|bodegon)\b/,
    traits: [
      ['traditional', 0.6],
      ['good_for_groups', 0.6],
      ['casual', 0.4],
      ['good_value', 0.3],
    ],
  },
  {
    pattern:
      /\b(pizzeria|pizza|empanadas|sandwicheria|hamburgueseria|burgers?|lomiteria|lomitos?|food truck|al paso)\b/,
    traits: [
      ['casual', 0.7],
      ['good_value', 0.5],
      ['good_for_groups', 0.4],
      ['romantic', -0.4],
      ['premium', -0.5],
    ],
  },
  {
    pattern: /\b(club|cantina|comedor|buffet|tenedor libre)\b/,
    traits: [
      ['traditional', 0.6],
      ['trendy', -0.3],
      ['casual', 0.6],
      ['good_value', 0.5],
      ['good_for_groups', 0.5],
      ['romantic', -0.4],
      ['intimate', -0.4],
      ['premium', -0.4],
    ],
  },
  {
    pattern: /\b(cerveceria|brew|brewing|brewpub|beer|birreria)\b/,
    traits: [
      ['craft_beer', 0.8],
      ['lively', 0.5],
      ['good_for_groups', 0.6],
      ['trendy', 0.3],
    ],
  },
  {
    pattern: /\b(vermuteria|vermu|vermut|vermouth)\b/,
    traits: [
      ['cocktails', 0.6],
      ['sharing_food', 0.5],
      ['trendy', 0.5],
      ['lively', 0.4],
    ],
  },
  {
    pattern:
      /\b(cocktail|cocktails|cocteleria|speakeasy|gin bar|bar de tragos)\b/,
    traits: [
      ['cocktails', 0.8],
      ['trendy', 0.5],
      ['late_night', 0.3],
    ],
  },
  {
    pattern: /\b(rooftop|terraza)\b/,
    traits: [
      ['view', 0.4],
      ['outdoor_seating', 0.5],
      ['trendy', 0.3],
    ],
  },
  {
    pattern:
      /\b(hot ?dogs?|panchos?|pancheria|super pancho|fast ?food|comida rapida)\b/,
    traits: [
      ['fast_food', 0.8],
      ['casual', 0.7],
      ['trendy', -0.5],
      ['romantic', -0.6],
      ['premium', -0.6],
    ],
  },
  {
    pattern: /\b(tapas|tapeo|picadas?|tablas?)\b/,
    traits: [['sharing_food', 0.6]],
  },
  {
    pattern: /\b(pub|resto bar|bar & grill|sports bar)\b/,
    traits: [
      ['lively', 0.5],
      ['good_for_groups', 0.5],
      ['late_night', 0.4],
    ],
  },
  {
    pattern:
      /\b(tea room|casa de te|pasteleria|patisserie|bakery|panaderia|confiteria)\b/,
    traits: [
      ['merienda', 0.6],
      ['quiet', 0.3],
    ],
  },
  {
    pattern: /\b(brunch)\b/,
    traits: [['brunch', 0.8]],
  },
];

export function nameTraits(name: string | null): TraitEvidence[] {
  if (!name) return [];
  const normal = normalizeSearchText(name);
  const found: TraitEvidence[] = [];
  for (const rule of NAME_RULES) {
    if (!rule.pattern.test(normal)) continue;
    for (const [trait, score] of rule.traits)
      if (!found.some((evidence) => evidence.trait === trait))
        found.push({ trait, score, source: 'NAME', confidence: 0.5 });
  }
  return found;
}

const MOMENT_RULES: { moment: MealMoment; pattern: RegExp }[] = [
  { moment: 'breakfast', pattern: /\b(desayuno|desayunos)\b/ },
  { moment: 'brunch', pattern: /\bbrunch\b/ },
  { moment: 'lunch', pattern: /\b(almuerzo|almuerzos|mediodia|ejecutivo)\b/ },
  { moment: 'merienda', pattern: /\b(merienda|meriendas)\b/ },
  { moment: 'dinner', pattern: /\b(cena|cenas|cenar)\b/ },
];

/** Moments an offering is for, from its own words; null when it does not say. */
export function momentsInText(text: string | null): MealMoment[] | null {
  if (!text) return null;
  const normal = normalizeSearchText(text);
  const moments = MOMENT_RULES.filter(({ pattern }) =>
    pattern.test(normal),
  ).map(({ moment }) => moment);
  return moments.length ? moments : null;
}

/** Traits supported by words in SmartPlan's own text, with the quote. */
export function descriptionTraits(text: string | null): TraitEvidence[] {
  if (!text) return [];
  const normal = normalizeSearchText(text);
  const found: TraitEvidence[] = [];
  for (const rule of DESCRIPTION_RULES) {
    const match = rule.pattern.exec(normal);
    if (match && !found.some((evidence) => evidence.trait === rule.trait)) {
      found.push({
        trait: rule.trait,
        score: 0.7,
        source: 'DESCRIPTION',
        confidence: DESCRIPTION_CONFIDENCE,
        evidence: match[0],
      });
    }
  }
  return found;
}

export function priorTraits(kind: string | null): TraitEvidence[] {
  const priors: TraitVector = planningOfKind(kind).priorTraits;
  return Object.entries(priors).map(([trait, score]) => ({
    trait: trait as PlaceTrait,
    score: score ?? 0,
    source: 'PRIOR' as const,
    confidence: PRIOR_CONFIDENCE,
  }));
}

/**
 * The effective value of one trait: a confidence-weighted average of what
 * every source says, so one strong curated tag outweighs a weak prior and a
 * community "muy ruidoso" can overturn a description.
 */
export function traitValue(
  traits: TraitEvidence[],
  trait: PlaceTrait,
): { value: number; weight: number } {
  let sum = 0;
  let weight = 0;
  for (const evidence of traits) {
    if (evidence.trait !== trait) continue;
    const w = TRAIT_SOURCE_WEIGHT[evidence.source] * evidence.confidence;
    sum += evidence.score * w;
    weight += w;
  }
  return { value: weight ? sum / weight : 0, weight };
}

/** The strongest quotable evidence of a trait, for explanations. */
export function quotableEvidence(
  traits: TraitEvidence[],
  trait: PlaceTrait,
): TraitEvidence | null {
  return (
    traits
      .filter(
        (evidence) =>
          evidence.trait === trait &&
          evidence.score > 0.3 &&
          QUOTABLE_TRAIT_SOURCES.has(evidence.source),
      )
      .sort(
        (a, b) =>
          TRAIT_SOURCE_WEIGHT[b.source] * b.confidence -
          TRAIT_SOURCE_WEIGHT[a.source] * a.confidence,
      )[0] ?? null
  );
}
