import { UNKNOWN_PRICE, type PriceFields } from '../../common/pricing/price';
import { planningOfKind } from '../../catalog/place-actionability';
import type { PlaceKind } from '../../catalog/taxonomy';
import type { PlanCandidate } from '../candidate';
import {
  buildPlanIntent,
  type IntentSourceFields,
} from '../intent/build-intent';
import type { PlanIntent } from '../intent/plan-intent';
import { priorTraits } from '../traits/traits';

/** Friday 2026-10-16 15:00 in Mendoza. */
export const FRIDAY_AFTERNOON = new Date('2026-10-16T15:00:00-03:00');

export function price(
  overrides: Partial<PriceFields> & Pick<PriceFields, 'priceKind'>,
): PriceFields {
  return {
    ...UNKNOWN_PRICE,
    priceUnit: overrides.priceKind === 'UNKNOWN' ? null : 'PER_PERSON',
    priceSource: overrides.priceKind === 'UNKNOWN' ? null : 'OFFICIAL',
    priceVerifiedAt:
      overrides.priceKind === 'UNKNOWN' ? null : new Date('2026-10-10'),
    ...overrides,
  };
}

let nextPlaceId = 1000;

/** A place-action candidate in central Mendoza, unknown price and hours. */
export function placeAction(
  overrides: Partial<PlanCandidate> & {
    placeKind?: PlaceKind;
    action?: PlanCandidate['action'];
  } = {},
): PlanCandidate {
  const placeKind = overrides.placeKind ?? 'restaurant';
  const planning = planningOfKind(placeKind);
  const placeId = overrides.placeId ?? nextPlaceId++;
  const action = overrides.action ?? planning.actions[0]?.action ?? 'meal';
  return {
    key: `p:${placeId}:${action}`,
    kind: 'PLACE_ACTION',
    menuEvidence: [],
    secondaryAction: false,
    activityId: null,
    placeId,
    action,
    name: `Lugar ${placeId}`,
    placeName: `Lugar ${placeId}`,
    placeKind,
    stopPolicy: planning.stopPolicy,
    role: planning.role,
    connective: planning.connective === true,
    description: null,
    address: null,
    idDepartment: 1,
    departmentName: 'Ciudad de Mendoza',
    latitude: -32.8895,
    longitude: -68.8458,
    location: 'OWNED',
    googlePlaceId: null,
    durationMinutes: planning.actions[0]?.durationMinutes ?? 60,
    moments: planning.actions[0]?.moments
      ? [...planning.actions[0].moments]
      : null,
    price: { ...UNKNOWN_PRICE },
    hours: null,
    availableTimesOfDay: [],
    availableMonths: null,
    minPeople: null,
    maxPeople: null,
    traits: priorTraits(placeKind),
    quality: { rating: null, ratingCount: 0, source: null },
    categoryNames: [],
    textScore: 0,
    distanceKm: 1,
    closedPermanently: false,
    ...overrides,
  };
}

export function intentFor(
  rawQuery: string,
  fields: Partial<IntentSourceFields> = {},
): PlanIntent {
  return buildPlanIntent({
    rawQuery,
    requestedAt: FRIDAY_AFTERNOON,
    budget: null,
    partySize: null,
    availableDuration: null,
    timeOfDay: null,
    travelMode: 'drive',
    latitude: null,
    longitude: null,
    radiusKm: null,
    idDepartment: 1,
    categoryIds: [],
    excludedCategoryIds: [],
    sources: {
      budget: null,
      partySize: null,
      duration: null,
      location: 'default',
    },
    ...fields,
  });
}

/**
 * What makes a candidate decision-grade: official hours open all day every
 * day and a fixed official price per person.
 */
export function known(amount = 8000): Pick<PlanCandidate, 'hours' | 'price'> {
  return {
    hours: {
      weekly: Array.from(
        { length: 7 },
        () => [[0, 1440]] as [number, number][],
      ),
      source: 'OFFICIAL',
      verifiedAt: new Date('2026-10-10'),
    },
    price: price({ priceKind: 'FIXED', priceMin: amount, priceMax: amount }),
  };
}
