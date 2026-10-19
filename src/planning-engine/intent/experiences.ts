/**
 * What a person can ask for, in their words ("cena", "merienda", "cerveza"),
 * mapped to the activity subtypes that satisfy it. An experience is not a
 * category: "cena romántica" and "comer barato" are both Gastronomy, yet they
 * want a different moment, budget and kind of place.
 *
 * `window` is the plausible local time window (minutes from midnight) used
 * to place the experience on a timeline when the person gave no time, and as
 * a prior when a venue's opening hours are unknown. It is a planning default,
 * never presented as a venue's hours.
 */
import type { ActivitySubtype, PlaceKind } from '../../catalog/taxonomy';
import type { MealMoment } from '../../catalog/place-actionability';

export type ExperienceKey =
  | 'dinner'
  | 'lunch'
  | 'brunch'
  | 'breakfast'
  | 'merienda'
  | 'meal'
  | 'drinks'
  | 'beer'
  | 'dessert'
  | 'dancing'
  | 'walk'
  | 'viewpoint'
  | 'museum'
  | 'culture'
  | 'movie'
  | 'show'
  | 'wine'
  | 'adventure'
  | 'wellness'
  | 'family_fun'
  /** Something fun that is an activity, not a meal (bowling, escape room…). */
  | 'fun'
  | 'shopping';

export interface ExperienceDefinition {
  label: string;
  /** Subtypes (of an offering or an intrinsic place action) that satisfy it. */
  actions: readonly ActivitySubtype[];
  moment?: MealMoment;
  /** Plausible local window, [start, end) in minutes; end may pass 1440. */
  window: readonly [number, number];
  /** Kinds it needs that only plan with a dated schedule (e.g. a cinema). */
  scheduleKinds?: readonly PlaceKind[];
  /** A meal-like anchor: at most one per plan. */
  meal?: boolean;
}

const h = (hours: number, minutes = 0) => hours * 60 + minutes;

export const EXPERIENCES: Record<ExperienceKey, ExperienceDefinition> = {
  dinner: {
    label: 'Cena',
    actions: ['meal', 'winery_meal'],
    moment: 'dinner',
    window: [h(20, 30), h(24)],
    meal: true,
  },
  lunch: {
    label: 'Almuerzo',
    actions: ['meal', 'winery_meal'],
    moment: 'lunch',
    window: [h(12, 30), h(15, 30)],
    meal: true,
  },
  brunch: {
    label: 'Brunch',
    actions: ['coffee', 'meal'],
    moment: 'brunch',
    window: [h(10), h(13, 30)],
    meal: true,
  },
  breakfast: {
    label: 'Desayuno',
    actions: ['coffee'],
    moment: 'breakfast',
    window: [h(8), h(11, 30)],
    meal: true,
  },
  merienda: {
    label: 'Merienda',
    actions: ['coffee', 'dessert'],
    moment: 'merienda',
    window: [h(16, 30), h(20)],
    meal: true,
  },
  /** "Comer" with no moment: resolved to lunch or dinner by time. */
  meal: {
    label: 'Comer',
    actions: ['meal', 'winery_meal'],
    window: [h(12, 30), h(24)],
    meal: true,
  },
  drinks: {
    label: 'Tragos',
    actions: ['drinks', 'craft_beer'],
    window: [h(19), h(26)],
  },
  beer: {
    label: 'Cerveza',
    actions: ['craft_beer', 'drinks'],
    window: [h(18), h(26)],
  },
  dessert: {
    label: 'Helado o postre',
    actions: ['dessert'],
    window: [h(15), h(25)],
  },
  dancing: {
    label: 'Bailar',
    actions: ['dancing'],
    window: [h(24, 30), h(29)],
  },
  walk: {
    label: 'Paseo',
    actions: ['walk', 'viewpoint_visit', 'heritage_visit'],
    window: [h(8), h(20, 30)],
  },
  viewpoint: {
    label: 'Mirador',
    actions: ['viewpoint_visit'],
    window: [h(8), h(20, 30)],
  },
  museum: {
    label: 'Museo',
    actions: ['museum_visit', 'heritage_visit', 'guided_tour'],
    window: [h(9), h(19)],
  },
  culture: {
    label: 'Cultura',
    actions: [
      'museum_visit',
      'heritage_visit',
      'guided_tour',
      'live_show',
      'workshop',
    ],
    window: [h(9), h(23)],
  },
  movie: {
    label: 'Cine',
    // Only a real dated screening (dynamic inventory) satisfies it.
    actions: ['movie_screening'],
    scheduleKinds: ['cinema'],
    window: [h(14), h(24)],
  },
  show: {
    label: 'Espectáculo',
    actions: ['live_show', 'live_music'],
    scheduleKinds: ['theatre', 'live_music_venue'],
    window: [h(20), h(25)],
  },
  wine: {
    label: 'Bodega',
    actions: ['tasting', 'winery_tour', 'winery_meal'],
    window: [h(10), h(18)],
  },
  adventure: {
    label: 'Aventura',
    actions: [
      'rafting',
      'horseback_riding',
      'trekking',
      'canopy',
      'kayak',
      'climbing',
      'paragliding',
      'mountain_bike',
      'day_trip',
    ],
    window: [h(8), h(19)],
  },
  wellness: {
    label: 'Relax',
    actions: ['spa_treatment', 'thermal_baths'],
    window: [h(10), h(21)],
  },
  family_fun: {
    label: 'En familia',
    actions: ['amusement', 'walk', 'museum_visit', 'dessert'],
    window: [h(10), h(20)],
  },
  fun: {
    label: 'Algo divertido',
    // Shows only through `show` (they need a dated schedule).
    actions: ['amusement'],
    window: [h(11), h(23, 30)],
  },
  shopping: {
    label: 'Compras',
    actions: ['shopping'],
    window: [h(10), h(21)],
  },
};

export function isExperienceKey(value: unknown): value is ExperienceKey {
  return typeof value === 'string' && Object.hasOwn(EXPERIENCES, value);
}

/** Every subtype that can satisfy at least one experience. */
export function experiencesSatisfiedBy(
  action: ActivitySubtype,
): ExperienceKey[] {
  return (Object.keys(EXPERIENCES) as ExperienceKey[]).filter((key) =>
    EXPERIENCES[key].actions.includes(action),
  );
}
