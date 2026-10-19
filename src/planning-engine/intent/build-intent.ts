import type { TimeOfDay } from '../../activities/activity-constraints';
import type { TravelMode } from '../../common/types/travel-mode';
import { normalizeSearchText } from '../../recommendation/local-intent';
import { addDays, ceilToQuarter, toLocal } from '../time';
import { readLexicon } from './intent-lexicon';
import { localityInText, regionInText } from './regions';
import { EXPERIENCES, type ExperienceKey } from './experiences';
import {
  APPLY_CONFIDENCE,
  effectsOf,
  facetKey,
  isFacetValue,
  type IntentFacet,
} from './semantics';
import {
  PLAN_INTENT_VERSION,
  type ExperienceRequest,
  type IntentProvenance,
  type PlanIntent,
  type TravelTolerance,
} from './plan-intent';

export interface IntentSourceFields {
  rawQuery: string | null;
  requestedAt: Date;
  /** Already resolved by the request pipeline (context → text → profile). */
  budget: number | null;
  partySize: number | null;
  availableDuration: number | null;
  timeOfDay: TimeOfDay | null;
  travelMode: TravelMode;
  latitude: number | null;
  longitude: number | null;
  radiusKm: number | null;
  idDepartment: number | null;
  categoryIds: number[];
  excludedCategoryIds: number[];
  /**
   * Facets the language model read in the person's own words (closed
   * vocabulary, already validated). The phrase reader's facets win on the
   * same facet; the model adds what the reader could not place.
   */
  modelFacets?: IntentFacet[];
  /** Actions the model read in the person's words (closed list, validated). */
  modelExperiences?: string[];
  /** Words left unplaced after the reader and the model (said back, never guessed). */
  unmappedTerms?: string[];
  /** Where the resolved scalar values came from. */
  sources: {
    budget: IntentProvenance | null;
    partySize: IntentProvenance | null;
    duration: IntentProvenance | null;
    location: IntentProvenance;
  };
}

/** Where a time of day starts a plan when no clock time was given. */
const TIME_OF_DAY_START: Record<TimeOfDay, number> = {
  morning: 10 * 60,
  afternoon: 16 * 60 + 30,
  evening: 20 * 60 + 30,
  night: 23 * 60,
};

const RADIUS_BY_TOLERANCE: Record<TravelTolerance, number> = {
  low: 6,
  medium: 15,
  high: 150,
};

export function radiusForTolerance(tolerance: TravelTolerance): number {
  return RADIUS_BY_TOLERANCE[tolerance];
}

/** Resolves "comer" to the meal of the moment: lunch by day, dinner at night. */
function resolveMeal(
  startMinutes: number | null,
  timeOfDay: TimeOfDay | null,
): ExperienceKey {
  if (startMinutes !== null) {
    if (startMinutes >= 7 * 60 && startMinutes < 11 * 60) return 'brunch';
    if (startMinutes >= 11 * 60 && startMinutes < 16 * 60) return 'lunch';
    if (startMinutes >= 16 * 60 && startMinutes < 19 * 60) return 'merienda';
    return 'dinner';
  }
  if (timeOfDay === 'morning') return 'brunch';
  if (timeOfDay === 'afternoon') return 'lunch';
  // In Mendoza "salir a comer" without a time is, by default, dinner.
  return 'dinner';
}

/** Keeps only valid, confident model facets that the reader did not already say. */
export function mergeModelFacets(
  read: IntentFacet[],
  model: IntentFacet[] | undefined,
): { facets: IntentFacet[]; lowConfidence: IntentFacet[] } {
  const facets = [...read];
  const lowConfidence: IntentFacet[] = [];
  const seen = new Set(facets.map((facet) => facetKey(facet)));
  for (const candidate of model ?? []) {
    if (!isFacetValue(candidate.dimension, candidate.value)) continue;
    if (candidate.confidence < APPLY_CONFIDENCE) {
      lowConfidence.push(candidate);
      continue;
    }
    // A refusal the reader saw ("no boliche") is never contradicted.
    const key = facetKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    facets.push({ ...candidate, provenance: 'model' });
  }
  return { facets, lowConfidence };
}

export function buildPlanIntent(fields: IntentSourceFields): PlanIntent {
  const text = normalizeSearchText(fields.rawQuery ?? '');
  const reading = readLexicon(text);
  const requested = toLocal(fields.requestedAt);
  const provenance: PlanIntent['provenance'] = {};

  // Date: explicit day word > weekday > today.
  let date = requested.date;
  if (reading.dayOffset !== null) {
    date = addDays(requested.date, reading.dayOffset);
    provenance.when = 'text';
  } else if (reading.weekday !== null) {
    const ahead = (reading.weekday - requested.weekday + 7) % 7;
    date = addDays(requested.date, ahead);
    provenance.when = 'text';
  }
  const isToday = date === requested.date;

  // Start time: a clock time > "ahora" > the time of day > chosen by shape.
  let startMinutes: number | null = reading.startMinutes;
  if (startMinutes !== null) provenance.when = 'text';
  const now = reading.now;
  if (startMinutes === null && now) {
    startMinutes = ceilToQuarter(requested.minutes + 15);
    provenance.when = 'text';
  }
  if (startMinutes === null && fields.timeOfDay) {
    startMinutes = TIME_OF_DAY_START[fields.timeOfDay];
    provenance.when ??= 'text';
  }
  // A start that already passed today: an explicit clock time with no day
  // word means its next occurrence (tomorrow); an inferred one ("a la
  // noche" asked at 23:00) moves to the next usable quarter.
  if (isToday && startMinutes !== null && startMinutes < requested.minutes) {
    if (
      reading.startMinutes !== null &&
      reading.dayOffset === null &&
      reading.weekday === null
    ) {
      date = addDays(requested.date, 1);
    } else {
      startMinutes = ceilToQuarter(requested.minutes + 15);
    }
  }

  // Party size: resolved number > company implied by the words > a couple
  // default for groups we cannot count (shown and editable, never hidden).
  let size = fields.partySize;
  let partyProvenance = fields.sources.partySize;
  if (size === null && reading.impliedPartySize !== null) {
    size = reading.impliedPartySize;
    // "con mi novia" means two, but they never said "dos".
    partyProvenance = 'inferred';
  }
  if (size === null) {
    size =
      reading.composition === 'friends' || reading.composition === 'family_kids'
        ? 2
        : reading.composition === 'couple'
          ? 2
          : 1;
    partyProvenance = 'default';
  }
  if (partyProvenance) provenance.party = partyProvenance;

  // Budget: a profile's usual budget is a habit, not a ceiling.
  let budget: PlanIntent['budget'] = null;
  if (fields.budget !== null && fields.budget > 0) {
    const strict =
      fields.sources.budget === 'profile'
        ? false
        : (reading.budgetStrict ?? true);
    budget = { amount: fields.budget, strict };
    if (fields.sources.budget) provenance.budget = fields.sources.budget;
  }

  // Experiences: what the words ask for, otherwise what the occasion implies.
  // A named locality ("en Chacras") is where the plan happens: a point and
  // radius, unless the person gave their own point.
  const locality = fields.latitude === null ? localityInText(text) : null;
  let experienceKeys = [...reading.experiences];
  if (experienceKeys.includes('meal')) {
    const meal = resolveMeal(startMinutes, fields.timeOfDay);
    experienceKeys = experienceKeys.map((key) => (key === 'meal' ? meal : key));
  }
  // Words the phrase reader could not place but the model could.
  let experienceProvenance: IntentProvenance = 'text';
  if (!experienceKeys.length && fields.modelExperiences?.length) {
    experienceKeys = fields.modelExperiences.filter(
      (key): key is ExperienceKey =>
        key in EXPERIENCES &&
        !reading.excludedExperiences.includes(key as ExperienceKey),
    );
    if (experienceKeys.includes('meal')) {
      const meal = resolveMeal(startMinutes, fields.timeOfDay);
      experienceKeys = experienceKeys.map((key) =>
        key === 'meal' ? meal : key,
      );
    }
    experienceProvenance = 'model';
  }
  const required = experienceKeys.length > 0;
  if (!required) experienceProvenance = 'default';
  if (!required && reading.impliedExperiences.length) {
    // Hinted, never said ("para charlar", "una previa"): a reasonable
    // action, shown as an inference.
    const social: ExperienceKey =
      (startMinutes ?? requested.minutes) >= 19 * 60 ? 'drinks' : 'merienda';
    experienceKeys = reading.impliedExperiences.map((key) =>
      key === 'social'
        ? social
        : key === 'meal'
          ? resolveMeal(startMinutes, fields.timeOfDay)
          : key,
    );
    experienceProvenance = 'inferred';
  }
  if (!experienceKeys.length) {
    if (reading.occasion === 'romantic' || reading.occasion === 'celebration')
      experienceKeys = ['dinner'];
    else if (reading.occasion === 'first_date') experienceKeys = ['drinks'];
    else if (reading.occasion === 'family')
      // With kids, something for them; with parents, a good table.
      experienceKeys =
        reading.composition === 'family_kids' ? ['family_fun'] : ['dinner'];
    else if (reading.occasion === 'friends') experienceKeys = ['beer'];
    // What people go to that locality for (Potrerillos: the river).
    if (!experienceKeys.length && locality?.defaults)
      experienceKeys = [...locality.defaults];
  }
  // "algo gratis al aire libre" with no named activity is a walk.
  if (
    experienceKeys.length === 0 &&
    reading.freeOnly &&
    reading.vibe.includes('outdoor')
  ) {
    experienceKeys = ['walk'];
  }
  const experiences: ExperienceRequest[] = [...new Set(experienceKeys)]
    .filter((key) => key in EXPERIENCES)
    .map((key) => ({ key, required }));
  if (experiences.length) provenance.experiences = experienceProvenance;

  const { facets } = mergeModelFacets(reading.facets, fields.modelFacets);
  const effects = effectsOf(facets);
  const vibe = [...reading.vibe];
  for (const trait of effects.vibe) if (!vibe.includes(trait)) vibe.push(trait);
  const avoid = [...reading.avoid];
  for (const trait of effects.avoid)
    if (!avoid.includes(trait) && !vibe.includes(trait)) avoid.push(trait);
  const avoidKeywords = [
    ...new Set([...reading.avoidKeywords, ...effects.avoidKeywords]),
  ];
  if (facets.length) provenance.facets = 'text';
  if (reading.occasion === 'romantic' && !vibe.includes('romantic'))
    vibe.push('romantic');
  if (reading.occasion === 'first_date' && !vibe.includes('intimate'))
    vibe.push('intimate');
  if (reading.occasion === 'friends' && !vibe.includes('good_for_groups'))
    vibe.push('good_for_groups');
  if (reading.kidFriendly && !vibe.includes('family_friendly'))
    vibe.push('family_friendly');
  if (reading.indoorOnly && !vibe.includes('indoor')) vibe.push('indoor');
  if (vibe.length) provenance.vibe = 'text';
  // A venue the person refused (`no boliche`) is never an anchor either.
  const excludedKinds = reading.excludedKinds;
  const excludedExperiences = reading.excludedExperiences;

  const tolerance: TravelTolerance =
    reading.travelTolerance ??
    (fields.travelMode === 'walk'
      ? 'low'
      : experiences.some(({ key }) => key === 'wine' || key === 'adventure')
        ? 'high'
        : 'medium');

  if (reading.occasion)
    provenance.occasion = reading.occasionInferred ? 'inferred' : 'text';
  provenance.travel = reading.travelTolerance ? 'text' : 'default';
  if (reading.pricePreference) provenance.pricePreference = 'text';
  if (
    reading.indoorOnly ||
    reading.freeOnly ||
    reading.kidFriendly ||
    reading.noFood
  )
    provenance.constraints = 'text';
  if (fields.sources.duration && fields.availableDuration !== null)
    provenance.duration = fields.sources.duration;
  provenance.location = fields.sources.location;
  if (locality) provenance.location = 'text';

  return {
    version: PLAN_INTENT_VERSION,
    when: {
      date,
      startMinutes,
      now,
      timeOfDay: fields.timeOfDay,
    },
    durationMinutes: fields.availableDuration,
    party: { size, composition: reading.composition },
    budget,
    location: {
      latitude: fields.latitude ?? locality?.centre.latitude ?? null,
      longitude: fields.longitude ?? locality?.centre.longitude ?? null,
      radiusKm: fields.radiusKm ?? locality?.radiusKm ?? null,
      idDepartment: fields.idDepartment,
      region: regionInText(text),
      travelTolerance: tolerance,
      travelMode: fields.travelMode,
    },
    occasion: reading.occasion,
    experiences,
    vibe,
    avoid,
    facets,
    avoidKeywords,
    excludedKinds,
    excludedExperiences,
    // Only said back when nothing at all was understood: otherwise the
    // reading stands and the stray word is just logged for review.
    unmapped:
      !facets.length &&
      !required &&
      !reading.occasion &&
      !reading.indoorOnly &&
      !reading.freeOnly
        ? (fields.unmappedTerms ?? []).slice(0, 4)
        : [],
    pricePreference: reading.pricePreference,
    novelty: reading.novelty,
    constraints: {
      indoorOnly: reading.indoorOnly,
      freeOnly: reading.freeOnly,
      noFood: reading.noFood,
      kidFriendly: reading.kidFriendly,
    },
    categoryIds: fields.categoryIds,
    excludedCategoryIds: fields.excludedCategoryIds,
    provenance,
  };
}

/** Words the lexicon understands, so the local parser can skip Gemini. */
export function lexiconKnownWords(rawQuery: string | null): string[] {
  return readLexicon(normalizeSearchText(rawQuery ?? '')).knownWords;
}
