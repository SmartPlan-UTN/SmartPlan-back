/**
 * What a place can contribute to a plan, by kind. This is the semantic model
 * behind "Place is not Activity" without the over-rigid reading of it.
 *
 * Some kinds intrinsically support a basic planning action: a restaurant is
 * for eating, a café for a coffee or a merienda, a museum for a visit. That is
 * not a manufactured experience, it is what the place IS, and the planner may
 * use it directly as a stop (a PLACE_ACTION candidate) without an Activity
 * row. Other kinds only become stops through a verified offering (a winery
 * does not imply a tasting, an adventure operator does not imply rafting), a
 * dated schedule (a cinema needs a screening), or never (a tour agency is a
 * provider, not somewhere you go).
 *
 * The map is exhaustive over `PlaceKind`: a new kind cannot be added without
 * deciding how it plans.
 */
import type { ActivitySubtype, PlaceKind } from './taxonomy';
import { isPlaceKind } from './taxonomy';

export type StopPolicy =
  /** Has intrinsic actions: the place itself can be a stop. */
  | 'DIRECT'
  /** Only verified Activities (offerings) at the place can be stops. */
  | 'OFFERING_REQUIRED'
  /** Needs a dated screening/event; without one it cannot be planned. */
  | 'SCHEDULE_REQUIRED'
  /** Discoverable, never inserted in a plan (its offerings may be). */
  | 'NOT_A_STOP';

/** What role the place plays for the person, used for copy and mixing. */
export type PlaceRole =
  | 'VENUE'
  | 'ATTRACTION'
  | 'PUBLIC_SPACE'
  | 'EXPERIENCE_PROVIDER'
  | 'EVENT_VENUE';

export type MealMoment =
  | 'breakfast'
  | 'brunch'
  | 'lunch'
  | 'merienda'
  | 'dinner'
  | 'late_night';

export const MEAL_MOMENTS: readonly MealMoment[] = [
  'breakfast',
  'brunch',
  'lunch',
  'merienda',
  'dinner',
  'late_night',
];

/**
 * How a place action's cost can be known. Never a number: amounts only come
 * from evidence (menus, official prices, observed spend).
 * - `MENU_BASKET`: estimated from the venue's menu or observed spend.
 * - `ENTRY`: an admission price that needs evidence (UNKNOWN otherwise).
 * - `PUBLIC_FREE`: a public space; walking through it costs nothing by
 *   definition of the kind (a public square), not by assumption.
 */
export type ActionPriceModel = 'MENU_BASKET' | 'ENTRY' | 'PUBLIC_FREE';

export interface IntrinsicAction {
  action: ActivitySubtype;
  moments?: readonly MealMoment[];
  /** Typical minutes spent. A planning default, shown as approximate. */
  durationMinutes: number;
  priceModel: ActionPriceModel;
}

/**
 * Controlled vocabulary of contextual traits. A trait describes how a place
 * feels for a context ("romantic", "lively"), separate from its quality.
 */
export const PLACE_TRAITS = [
  'romantic',
  'intimate',
  'quiet',
  'lively',
  'good_for_groups',
  'family_friendly',
  'premium',
  'casual',
  'good_value',
  'view',
  'outdoor',
  'indoor',
  'outdoor_seating',
  'live_music',
  'late_night',
  'wine_focus',
  'craft_beer',
  'brunch',
  'merienda',
  'vegetarian_friendly',
  /** Contemporary, current, "con onda": a social, modern format. */
  'trendy',
  /** Classic, old-school, family-style (bodegón, comedor, parrilla clásica). */
  'traditional',
  'cocktails',
  /** Food meant to share (tapas, tablas, pizzas, picadas). */
  'sharing_food',
  /** A counter / quick-service format (hot dogs, fast food). */
  'fast_food',
  'dessert_focus',
] as const;

export type PlaceTrait = (typeof PLACE_TRAITS)[number];

export function isPlaceTrait(value: unknown): value is PlaceTrait {
  return (
    typeof value === 'string' &&
    (PLACE_TRAITS as readonly string[]).includes(value)
  );
}

/** A trait value in [-1, 1]; negative means the place is the opposite. */
export type TraitVector = Partial<Record<PlaceTrait, number>>;

export interface PlaceKindPlanning {
  stopPolicy: StopPolicy;
  role: PlaceRole;
  actions: readonly IntrinsicAction[];
  /**
   * Generic public spaces (a plaza, a neighbourhood park) are connective
   * tissue: fine as a short walk between stops or when the person asked for
   * a walk, never the anchor of an unrelated plan.
   */
  connective?: boolean;
  /**
   * Weak priors of the kind, never shown as facts about one place. They only
   * order candidates until real evidence (curated, menu, community) exists.
   */
  priorTraits: TraitVector;
}

const meal = (
  moments: readonly MealMoment[],
  durationMinutes: number,
): IntrinsicAction => ({
  action: 'meal',
  moments,
  durationMinutes,
  priceModel: 'MENU_BASKET',
});

export const PLACE_KIND_PLANNING = {
  restaurant: {
    stopPolicy: 'DIRECT',
    role: 'VENUE',
    actions: [meal(['lunch', 'dinner'], 100)],
    priorTraits: { indoor: 0.6 },
  },
  cafe: {
    stopPolicy: 'DIRECT',
    role: 'VENUE',
    actions: [
      {
        action: 'coffee',
        moments: ['breakfast', 'brunch', 'merienda'],
        durationMinutes: 60,
        priceModel: 'MENU_BASKET',
      },
    ],
    priorTraits: { casual: 0.4, quiet: 0.2, merienda: 0.5, indoor: 0.6 },
  },
  bakery: {
    stopPolicy: 'DIRECT',
    role: 'VENUE',
    actions: [
      {
        action: 'coffee',
        moments: ['breakfast', 'merienda'],
        durationMinutes: 40,
        priceModel: 'MENU_BASKET',
      },
    ],
    priorTraits: { casual: 0.5, merienda: 0.5, family_friendly: 0.3 },
  },
  ice_cream: {
    stopPolicy: 'DIRECT',
    role: 'VENUE',
    actions: [
      {
        action: 'dessert',
        moments: ['merienda', 'dinner', 'late_night'],
        durationMinutes: 30,
        priceModel: 'MENU_BASKET',
      },
    ],
    priorTraits: { casual: 0.6, family_friendly: 0.6 },
  },
  bar: {
    stopPolicy: 'DIRECT',
    role: 'VENUE',
    actions: [
      {
        action: 'drinks',
        moments: ['dinner', 'late_night'],
        durationMinutes: 90,
        priceModel: 'MENU_BASKET',
      },
    ],
    priorTraits: {
      lively: 0.4,
      late_night: 0.5,
      good_for_groups: 0.3,
      family_friendly: -0.5,
    },
  },
  brewery: {
    stopPolicy: 'DIRECT',
    role: 'VENUE',
    actions: [
      {
        action: 'craft_beer',
        moments: ['merienda', 'dinner', 'late_night'],
        durationMinutes: 90,
        priceModel: 'MENU_BASKET',
      },
    ],
    priorTraits: {
      craft_beer: 1,
      lively: 0.5,
      casual: 0.6,
      good_for_groups: 0.6,
      family_friendly: -0.3,
    },
  },
  nightclub: {
    stopPolicy: 'DIRECT',
    role: 'VENUE',
    actions: [
      {
        action: 'dancing',
        moments: ['late_night'],
        durationMinutes: 180,
        priceModel: 'ENTRY',
      },
    ],
    priorTraits: {
      lively: 0.9,
      late_night: 1,
      good_for_groups: 0.6,
      quiet: -1,
      intimate: -0.6,
      family_friendly: -1,
    },
  },
  market: {
    stopPolicy: 'DIRECT',
    role: 'ATTRACTION',
    actions: [
      {
        action: 'shopping',
        durationMinutes: 60,
        priceModel: 'MENU_BASKET',
      },
    ],
    priorTraits: { casual: 0.6, lively: 0.4, family_friendly: 0.4 },
  },
  shopping_center: {
    stopPolicy: 'DIRECT',
    role: 'VENUE',
    actions: [
      { action: 'shopping', durationMinutes: 90, priceModel: 'MENU_BASKET' },
    ],
    priorTraits: { indoor: 1, casual: 0.4, family_friendly: 0.5 },
  },
  museum: {
    stopPolicy: 'DIRECT',
    role: 'ATTRACTION',
    actions: [
      { action: 'museum_visit', durationMinutes: 75, priceModel: 'ENTRY' },
    ],
    priorTraits: { indoor: 1, quiet: 0.5, family_friendly: 0.3 },
  },
  cultural_center: {
    stopPolicy: 'DIRECT',
    role: 'ATTRACTION',
    actions: [
      { action: 'museum_visit', durationMinutes: 60, priceModel: 'ENTRY' },
    ],
    priorTraits: { indoor: 0.8, quiet: 0.3 },
  },
  heritage: {
    stopPolicy: 'DIRECT',
    role: 'ATTRACTION',
    actions: [
      { action: 'heritage_visit', durationMinutes: 45, priceModel: 'ENTRY' },
    ],
    priorTraits: { quiet: 0.3 },
  },
  memorial: {
    stopPolicy: 'DIRECT',
    role: 'PUBLIC_SPACE',
    actions: [
      {
        action: 'heritage_visit',
        durationMinutes: 25,
        priceModel: 'PUBLIC_FREE',
      },
    ],
    connective: true,
    priorTraits: { outdoor: 1 },
  },
  park: {
    stopPolicy: 'DIRECT',
    role: 'PUBLIC_SPACE',
    actions: [
      { action: 'walk', durationMinutes: 60, priceModel: 'PUBLIC_FREE' },
    ],
    connective: true,
    priorTraits: { outdoor: 1, family_friendly: 0.6, casual: 0.5 },
  },
  plaza: {
    stopPolicy: 'DIRECT',
    role: 'PUBLIC_SPACE',
    actions: [
      { action: 'walk', durationMinutes: 30, priceModel: 'PUBLIC_FREE' },
    ],
    connective: true,
    priorTraits: { outdoor: 1, family_friendly: 0.4, casual: 0.5 },
  },
  viewpoint: {
    stopPolicy: 'DIRECT',
    role: 'ATTRACTION',
    actions: [
      {
        action: 'viewpoint_visit',
        durationMinutes: 45,
        priceModel: 'PUBLIC_FREE',
      },
    ],
    priorTraits: { view: 1, outdoor: 1, romantic: 0.3 },
  },
  mountain: {
    stopPolicy: 'OFFERING_REQUIRED',
    role: 'ATTRACTION',
    actions: [],
    priorTraits: { outdoor: 1, view: 0.6 },
  },
  nature_reserve: {
    stopPolicy: 'DIRECT',
    role: 'ATTRACTION',
    actions: [{ action: 'walk', durationMinutes: 120, priceModel: 'ENTRY' }],
    priorTraits: { outdoor: 1, view: 0.5, quiet: 0.5 },
  },
  natural_monument: {
    stopPolicy: 'DIRECT',
    role: 'ATTRACTION',
    actions: [
      { action: 'viewpoint_visit', durationMinutes: 60, priceModel: 'ENTRY' },
    ],
    priorTraits: { outdoor: 1, view: 0.8 },
  },
  reservoir: {
    stopPolicy: 'DIRECT',
    role: 'ATTRACTION',
    actions: [
      { action: 'viewpoint_visit', durationMinutes: 60, priceModel: 'ENTRY' },
    ],
    priorTraits: { outdoor: 1, view: 0.7 },
  },
  canyon: {
    stopPolicy: 'DIRECT',
    role: 'ATTRACTION',
    actions: [
      { action: 'viewpoint_visit', durationMinutes: 60, priceModel: 'ENTRY' },
    ],
    priorTraits: { outdoor: 1, view: 0.8 },
  },
  zoo: {
    stopPolicy: 'DIRECT',
    role: 'ATTRACTION',
    actions: [
      { action: 'amusement', durationMinutes: 120, priceModel: 'ENTRY' },
    ],
    priorTraits: { family_friendly: 1, outdoor: 0.6 },
  },
  amusement: {
    stopPolicy: 'DIRECT',
    role: 'ATTRACTION',
    actions: [
      { action: 'amusement', durationMinutes: 90, priceModel: 'ENTRY' },
    ],
    priorTraits: { family_friendly: 0.8, lively: 0.5 },
  },
  winery: {
    stopPolicy: 'OFFERING_REQUIRED',
    role: 'EXPERIENCE_PROVIDER',
    actions: [],
    priorTraits: { wine_focus: 1, view: 0.4, premium: 0.3 },
  },
  distillery: {
    stopPolicy: 'OFFERING_REQUIRED',
    role: 'EXPERIENCE_PROVIDER',
    actions: [],
    priorTraits: {},
  },
  olive_mill: {
    stopPolicy: 'OFFERING_REQUIRED',
    role: 'EXPERIENCE_PROVIDER',
    actions: [],
    priorTraits: {},
  },
  hot_springs: {
    stopPolicy: 'OFFERING_REQUIRED',
    role: 'EXPERIENCE_PROVIDER',
    actions: [],
    priorTraits: { quiet: 0.5 },
  },
  spa: {
    stopPolicy: 'OFFERING_REQUIRED',
    role: 'EXPERIENCE_PROVIDER',
    actions: [],
    priorTraits: { quiet: 0.8, indoor: 1 },
  },
  ski_resort: {
    stopPolicy: 'OFFERING_REQUIRED',
    role: 'EXPERIENCE_PROVIDER',
    actions: [],
    priorTraits: { outdoor: 1 },
  },
  adventure_operator: {
    stopPolicy: 'OFFERING_REQUIRED',
    role: 'EXPERIENCE_PROVIDER',
    actions: [],
    priorTraits: { outdoor: 0.8 },
  },
  sports_venue: {
    stopPolicy: 'OFFERING_REQUIRED',
    role: 'EXPERIENCE_PROVIDER',
    actions: [],
    priorTraits: {},
  },
  cinema: {
    stopPolicy: 'SCHEDULE_REQUIRED',
    role: 'EVENT_VENUE',
    actions: [],
    priorTraits: { indoor: 1, family_friendly: 0.4 },
  },
  theatre: {
    stopPolicy: 'SCHEDULE_REQUIRED',
    role: 'EVENT_VENUE',
    actions: [],
    priorTraits: { indoor: 1 },
  },
  live_music_venue: {
    stopPolicy: 'SCHEDULE_REQUIRED',
    role: 'EVENT_VENUE',
    actions: [],
    priorTraits: { live_music: 1, lively: 0.6, late_night: 0.5 },
  },
  stadium: {
    stopPolicy: 'SCHEDULE_REQUIRED',
    role: 'EVENT_VENUE',
    actions: [],
    priorTraits: { lively: 0.8 },
  },
  tour_operator: {
    stopPolicy: 'NOT_A_STOP',
    role: 'EXPERIENCE_PROVIDER',
    actions: [],
    priorTraits: {},
  },
  visitor_center: {
    stopPolicy: 'NOT_A_STOP',
    role: 'ATTRACTION',
    actions: [],
    priorTraits: {},
  },
  // The virtual Hogar: only its games and plans at home (offerings) are
  // stops, wherever the group is.
  home: {
    stopPolicy: 'OFFERING_REQUIRED',
    role: 'VENUE',
    actions: [],
    priorTraits: { indoor: 1 },
  },
} as const satisfies Record<PlaceKind, PlaceKindPlanning>;

/** Planning semantics of a stored kind; unknown kinds never become stops. */
export function planningOfKind(
  kind: string | null | undefined,
): PlaceKindPlanning {
  return isPlaceKind(kind)
    ? PLACE_KIND_PLANNING[kind]
    : {
        stopPolicy: 'NOT_A_STOP',
        role: 'ATTRACTION',
        actions: [],
        priorTraits: {},
      };
}

/** Kinds whose places can be planned directly through an intrinsic action. */
export function directKinds(): PlaceKind[] {
  return (Object.keys(PLACE_KIND_PLANNING) as PlaceKind[]).filter(
    (kind) => PLACE_KIND_PLANNING[kind].stopPolicy === 'DIRECT',
  );
}

/** The intrinsic action of a kind, if it supports that activity subtype. */
export function intrinsicAction(
  kind: string | null | undefined,
  action: string,
): IntrinsicAction | null {
  const planning = planningOfKind(kind);
  if (planning.stopPolicy !== 'DIRECT') return null;
  return planning.actions.find((entry) => entry.action === action) ?? null;
}
