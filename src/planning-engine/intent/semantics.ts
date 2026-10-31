/**
 * Composable semantic vocabulary of a request. A person says "un lugar
 * fachero para tomar algo"; that is not a category, it is several independent
 * facets that compose: an action (drinks), a style (stylish / trendy) and
 * maybe what they do NOT want ("pero no boliche").
 *
 * The vocabulary is closed on purpose: the language model and the
 * deterministic phrase reader both emit values from here, never free text, so
 * every facet can be validated, explained, tested and mapped to the evidence
 * a venue can really have. The vocabulary is not the intelligence; it is the
 * contract the intelligence writes into.
 */
import type { PlaceTrait } from '../../catalog/place-actionability';
import type { PlaceKind } from '../../catalog/taxonomy';
import type { ExperienceKey } from './experiences';
import type { IntentProvenance } from './plan-intent';

export const FACET_DIMENSIONS = [
  'occasion',
  'energy',
  'style',
  'social',
  'food_drink',
  'goal',
  'economic',
  'novelty',
  'setting',
] as const;

export type FacetDimension = (typeof FACET_DIMENSIONS)[number];

export const FACET_VOCABULARY: Record<FacetDimension, readonly string[]> = {
  occasion: [
    'date',
    'first_date',
    'partner',
    'friends',
    'family',
    'celebration',
    'birthday',
    'after_work',
    'solo',
    'group',
  ],
  energy: ['quiet', 'chill', 'social', 'lively', 'high_energy'],
  style: [
    'stylish',
    'trendy',
    'modern',
    'aesthetic',
    'cozy',
    'intimate',
    'elegant',
    'premium',
    'casual',
    'alternative',
    'artsy',
    'traditional',
    'rustic',
    'scenic',
    'rooftop',
    'garden',
    'pretentious',
  ],
  social: [
    'conversation_friendly',
    'good_for_groups',
    'date_friendly',
    'music',
    'live_music',
    'dj',
    'dancing',
    'nightclub',
  ],
  food_drink: [
    'breakfast',
    'brunch',
    'lunch',
    'dinner',
    'merienda',
    'coffee',
    'dessert',
    'beer',
    'craft_beer',
    'wine',
    'cocktails',
    'vermouth',
    'pre_drinks',
    'sushi',
    'burgers',
    'pizza',
    'pasta',
    'vegetarian',
    'sharing_food',
  ],
  goal: [
    'surprising',
    'special',
    'fun',
    'laugh',
    'relaxing',
    'romantic',
    'adventurous',
    'different',
    'local_authentic',
  ],
  economic: [
    'very_cheap',
    'budget',
    'moderate',
    'premium',
    'no_budget_limit',
    'value_for_money',
  ],
  novelty: [
    'iconic',
    'popular',
    'local_favorite',
    'hidden_gem',
    'new_place',
    'familiar_style',
  ],
  setting: ['indoor', 'outdoor', 'mountain', 'easy_effort'],
};

export function isFacetValue(dimension: string, value: string): boolean {
  return (
    (FACET_DIMENSIONS as readonly string[]).includes(dimension) &&
    FACET_VOCABULARY[dimension as FacetDimension].includes(value)
  );
}

/** How firmly a facet binds: a hard one excludes, a soft one only weighs. */
export type FacetStrength = 'soft' | 'hard';

export interface IntentFacet {
  dimension: FacetDimension;
  value: string;
  /** `want` = asked for; `avoid` = explicitly not wanted. */
  polarity: 'want' | 'avoid';
  strength: FacetStrength;
  provenance: IntentProvenance;
  /** 0..1; below `APPLY_CONFIDENCE` it is logged for review, never applied. */
  confidence: number;
  /** The person's own words that produced it ("fachero"), for explanations. */
  phrase?: string;
}

export const APPLY_CONFIDENCE = 0.5;

export const facetKey = (facet: Pick<IntentFacet, 'dimension' | 'value'>) =>
  `${facet.dimension}.${facet.value}`;

/** Person-facing label and icon of every facet value (Spanish, Argentina). */
export const FACET_LABELS: Record<string, { label: string; icon: string }> = {
  'occasion.date': { label: 'Una cita', icon: '💞' },
  'occasion.first_date': { label: 'Primera cita', icon: '💞' },
  'occasion.partner': { label: 'En pareja', icon: '💞' },
  'occasion.friends': { label: 'Con amigos', icon: '🍻' },
  'occasion.family': { label: 'En familia', icon: '👨‍👩‍👧' },
  'occasion.celebration': { label: 'Festejo', icon: '🎉' },
  'occasion.birthday': { label: 'Cumpleaños', icon: '🎂' },
  'occasion.after_work': { label: 'Después del trabajo', icon: '💼' },
  'occasion.solo': { label: 'Solo', icon: '🙋' },
  'occasion.group': { label: 'En grupo', icon: '👥' },
  'energy.quiet': { label: 'Tranqui', icon: '🌿' },
  'energy.chill': { label: 'Relajado', icon: '🌿' },
  'energy.social': { label: 'Social', icon: '💬' },
  'energy.lively': { label: 'Con movimiento', icon: '⚡' },
  'energy.high_energy': { label: 'De joda', icon: '🔥' },
  'style.stylish': { label: 'Con estilo', icon: '✨' },
  'style.trendy': { label: 'De moda', icon: '✨' },
  'style.modern': { label: 'Moderno', icon: '✨' },
  'style.aesthetic': { label: 'Estético', icon: '🎞️' },
  'style.cozy': { label: 'Acogedor', icon: '🕯️' },
  'style.intimate': { label: 'Íntimo', icon: '🕯️' },
  'style.elegant': { label: 'Elegante', icon: '🥂' },
  'style.premium': { label: 'Premium', icon: '🥂' },
  'style.casual': { label: 'Informal', icon: '👟' },
  'style.alternative': { label: 'Alternativo', icon: '🎸' },
  'style.artsy': { label: 'Artístico', icon: '🎨' },
  'style.traditional': { label: 'Tradicional', icon: '🏛️' },
  'style.rustic': { label: 'Rústico', icon: '🪵' },
  'style.scenic': { label: 'Con vista', icon: '🏔️' },
  'style.rooftop': { label: 'Rooftop', icon: '🌆' },
  'style.garden': { label: 'Con jardín', icon: '🌳' },
  'style.pretentious': { label: 'Pretencioso', icon: '🎭' },
  'social.conversation_friendly': { label: 'Para charlar', icon: '💬' },
  'social.good_for_groups': { label: 'Para grupos', icon: '👥' },
  'social.date_friendly': { label: 'Para una cita', icon: '💞' },
  'social.music': { label: 'Con música', icon: '🎵' },
  'social.live_music': { label: 'Música en vivo', icon: '🎸' },
  'social.dj': { label: 'DJ', icon: '🎧' },
  'social.dancing': { label: 'Bailar', icon: '💃' },
  'social.nightclub': { label: 'Boliche', icon: '🪩' },
  'food_drink.breakfast': { label: 'Desayuno', icon: '☕' },
  'food_drink.brunch': { label: 'Brunch', icon: '🥐' },
  'food_drink.lunch': { label: 'Almuerzo', icon: '🍽️' },
  'food_drink.dinner': { label: 'Cena', icon: '🍽️' },
  'food_drink.merienda': { label: 'Merienda', icon: '🧁' },
  'food_drink.coffee': { label: 'Café', icon: '☕' },
  'food_drink.dessert': { label: 'Postre', icon: '🍨' },
  'food_drink.beer': { label: 'Cerveza', icon: '🍺' },
  'food_drink.craft_beer': { label: 'Cerveza artesanal', icon: '🍺' },
  'food_drink.wine': { label: 'Vino', icon: '🍷' },
  'food_drink.cocktails': { label: 'Tragos de autor', icon: '🍸' },
  'food_drink.vermouth': { label: 'Vermú', icon: '🍸' },
  'food_drink.pre_drinks': { label: 'La previa', icon: '🥂' },
  'food_drink.sushi': { label: 'Sushi', icon: '🍣' },
  'food_drink.burgers': { label: 'Hamburguesas', icon: '🍔' },
  'food_drink.pizza': { label: 'Pizza', icon: '🍕' },
  'food_drink.pasta': { label: 'Pastas', icon: '🍝' },
  'food_drink.vegetarian': { label: 'Vegetariano', icon: '🥗' },
  'food_drink.sharing_food': { label: 'Algo para picar', icon: '🧀' },
  'goal.surprising': { label: 'Sorprender', icon: '🎁' },
  'goal.special': { label: 'Algo especial', icon: '⭐' },
  'goal.fun': { label: 'Divertido', icon: '🎈' },
  'goal.laugh': { label: 'Para reírse', icon: '😂' },
  'goal.relaxing': { label: 'Para relajarse', icon: '🌿' },
  'goal.romantic': { label: 'Romántico', icon: '🌹' },
  'goal.adventurous': { label: 'Con adrenalina', icon: '🧗' },
  'goal.different': { label: 'Algo distinto', icon: '🧭' },
  'goal.local_authentic': { label: 'Auténtico y local', icon: '🍇' },
  'economic.very_cheap': { label: 'Lo más barato', icon: '💸' },
  'economic.budget': { label: 'Económico', icon: '💸' },
  'economic.moderate': { label: 'Precio razonable', icon: '💸' },
  'economic.premium': { label: 'Sin escatimar', icon: '💎' },
  'economic.no_budget_limit': { label: 'Sin tope de gasto', icon: '💎' },
  'economic.value_for_money': { label: 'Buena relación precio', icon: '⚖️' },
  'novelty.iconic': { label: 'Un clásico', icon: '🏛️' },
  'novelty.popular': { label: 'Popular', icon: '🔥' },
  'novelty.local_favorite': { label: 'Favorito local', icon: '🍇' },
  'novelty.hidden_gem': { label: 'Joyita escondida', icon: '💎' },
  'novelty.new_place': { label: 'Lugar nuevo', icon: '🆕' },
  'novelty.familiar_style': { label: 'Algo conocido', icon: '🛋️' },
  'setting.indoor': { label: 'Bajo techo', icon: '🏠' },
  'setting.outdoor': { label: 'Al aire libre', icon: '🌤️' },
  'setting.mountain': { label: 'Montaña', icon: '⛰️' },
  'setting.easy_effort': { label: 'Sin esfuerzo', icon: '🚶' },
};

/**
 * Venue evidence each facet is judged against. Only traits a venue can really
 * carry (name format, description, curated / community tags, open data):
 * a facet with no mapped trait still shows what we understood, but never
 * claims a venue has it.
 */
export const FACET_TRAITS: Record<string, readonly PlaceTrait[]> = {
  'energy.quiet': ['quiet'],
  'energy.chill': ['quiet'],
  'energy.social': ['good_for_groups'],
  'energy.lively': ['lively'],
  'energy.high_energy': ['lively', 'late_night'],
  'style.stylish': ['trendy'],
  'style.trendy': ['trendy'],
  'style.modern': ['trendy'],
  'style.aesthetic': ['trendy'],
  'style.alternative': ['trendy'],
  'style.artsy': ['trendy'],
  'style.cozy': ['intimate'],
  'style.intimate': ['intimate'],
  'style.elegant': ['premium'],
  'style.premium': ['premium'],
  'style.casual': ['casual'],
  'style.traditional': ['traditional'],
  'style.rustic': ['traditional'],
  'style.scenic': ['view'],
  'style.rooftop': ['view', 'outdoor_seating'],
  'style.garden': ['outdoor_seating'],
  'social.conversation_friendly': ['quiet'],
  'social.good_for_groups': ['good_for_groups'],
  'social.date_friendly': ['romantic', 'intimate'],
  'social.music': ['live_music'],
  'social.live_music': ['live_music'],
  'social.dj': ['lively', 'late_night'],
  'social.nightclub': ['lively', 'late_night'],
  'food_drink.craft_beer': ['craft_beer'],
  'food_drink.wine': ['wine_focus'],
  'food_drink.cocktails': ['cocktails'],
  'food_drink.vermouth': ['cocktails', 'sharing_food'],
  'food_drink.sharing_food': ['sharing_food'],
  'food_drink.vegetarian': ['vegetarian_friendly'],
  'food_drink.dessert': ['dessert_focus'],
  'goal.romantic': ['romantic'],
  'goal.relaxing': ['quiet'],
  'setting.indoor': ['indoor'],
  'setting.outdoor': ['outdoor'],
};

/** What a facet implies one should (softly) steer away from. */
const IMPLIED_AVOIDS: Record<string, readonly PlaceTrait[]> = {
  'style.stylish': ['fast_food', 'traditional'],
  'style.trendy': ['fast_food', 'traditional'],
  'style.modern': ['fast_food', 'traditional'],
  'style.aesthetic': ['fast_food'],
  'energy.quiet': ['lively'],
  'energy.chill': ['lively'],
  'social.conversation_friendly': ['lively'],
  'style.elegant': ['fast_food'],
  'goal.romantic': ['fast_food'],
};

/** Food words a venue's own name / menu / description can be checked for. */
export const FOOD_KEYWORDS: Record<string, readonly string[]> = {
  burgers: ['hamburgues', 'burger', 'burguer', 'lomit'],
  pizza: ['pizz'],
  sushi: ['sushi'],
  pasta: ['pasta', 'trattoria', 'spaghet'],
};

export interface FacetEffects {
  vibe: PlaceTrait[];
  avoid: PlaceTrait[];
  /** Food words to steer away from (a venue that shows them is penalized). */
  avoidKeywords: string[];
}

/** Facets → the venue traits to look for and to steer away from. */
export function effectsOf(facets: readonly IntentFacet[]): FacetEffects {
  const vibe = new Set<PlaceTrait>();
  const avoid = new Set<PlaceTrait>();
  const avoidKeywords = new Set<string>();
  const applied = facets.filter(
    (facet) => facet.confidence >= APPLY_CONFIDENCE,
  );
  for (const facet of applied) {
    const key = facetKey(facet);
    if (facet.polarity === 'want') {
      for (const trait of FACET_TRAITS[key] ?? []) vibe.add(trait);
      for (const trait of IMPLIED_AVOIDS[key] ?? []) avoid.add(trait);
    } else {
      // A refused kind ("no boliche") is excluded outright; its traits are
      // not projected onto other venues that merely share a mood.
      if (facet.strength !== 'hard')
        for (const trait of FACET_TRAITS[key] ?? []) avoid.add(trait);
      if (facet.dimension === 'food_drink')
        for (const word of FOOD_KEYWORDS[facet.value] ?? [])
          avoidKeywords.add(word);
    }
  }
  // Something asked for is never also avoided.
  for (const trait of vibe) avoid.delete(trait);
  return {
    vibe: [...vibe],
    avoid: [...avoid],
    avoidKeywords: [...avoidKeywords],
  };
}

/** Venue kinds an explicit "no X" excludes outright. */
export type ExcludedKind = PlaceKind;

export interface ExclusionSeed {
  kinds?: PlaceKind[];
  experiences?: ExperienceKey[];
}
