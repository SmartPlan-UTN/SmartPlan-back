/**
 * Refinement: change one thing about a plan without rerolling the rest.
 *
 * "Cambiar la cena" on A → B → C keeps A and C (pinned to their slots and
 * the plan's start) and re-solves only B's slot: A → D → C. Whole-plan
 * adjustments ("más barato", "más romántico", "menos traslado", "algo más
 * original") change the intent and keep what still fits.
 */
import type { PlanIntent } from '../intent/plan-intent';
import type { IntentFacet } from '../intent/semantics';

export const REFINEMENT_ACTIONS = [
  'CHEAPER',
  'MORE_ROMANTIC',
  'LESS_TRAVEL',
  'MORE_ORIGINAL',
  'MORE_CALM',
  'MORE_MODERN',
  'SWAP_STOP',
  'REMOVE_STOP',
] as const;
export type RefinementAction = (typeof REFINEMENT_ACTIONS)[number];

/** One stop of the base plan, as the planner knows it. */
export interface BaseStop {
  slotId: string;
  slotRole: string;
  key: string;
  placeId: number;
  start: number | null;
}

/** What the engine needs to re-solve a refinement (stored on the request). */
export interface RefinementSpec {
  action: RefinementAction;
  basePlanId: number;
  stopIndex: number | null;
  /** Slot id → candidate key kept as is. */
  pinned: { slotId: string; key: string }[];
  excludedPlaceIds: number[];
  excludedKeys: string[];
  /** Slot dropped from the shape (REMOVE_STOP). */
  removedSlotId: string | null;
  /** The base plan's anchor start, kept so unchanged stops keep their times. */
  anchorStart: number | null;
  /** The base plan's slots (ids, roles, experiences), reused as the shape. */
  shape: { id: string; role: string; experiences: string[] }[];
}

export class RefinementError extends Error {
  constructor(
    readonly code: 'STOP_NOT_FOUND' | 'CANNOT_REMOVE_ONLY_ANCHOR',
    message: string,
  ) {
    super(message);
  }
}

export function refinementSpec(
  action: RefinementAction,
  basePlanId: number,
  stops: BaseStop[],
  stopIndex: number | null,
  shape: RefinementSpec['shape'],
): RefinementSpec {
  const anchor = stops.find((stop) => stop.slotRole === 'ANCHOR') ?? stops[0];
  const spec: RefinementSpec = {
    action,
    basePlanId,
    stopIndex,
    pinned: [],
    excludedPlaceIds: [],
    excludedKeys: [],
    removedSlotId: null,
    anchorStart: anchor?.start ?? null,
    shape,
  };
  if (action === 'SWAP_STOP' || action === 'REMOVE_STOP') {
    const target = stopIndex === null ? undefined : stops[stopIndex];
    if (!target)
      throw new RefinementError(
        'STOP_NOT_FOUND',
        'That stop is not in the plan.',
      );
    if (
      action === 'REMOVE_STOP' &&
      target.slotRole === 'ANCHOR' &&
      stops.filter((stop) => stop.slotRole === 'ANCHOR').length === 1
    )
      throw new RefinementError(
        'CANNOT_REMOVE_ONLY_ANCHOR',
        'This stop is the centre of the plan; change it instead.',
      );
    spec.pinned = stops
      .filter((stop) => stop !== target)
      .map((stop) => ({ slotId: stop.slotId, key: stop.key }));
    if (action === 'SWAP_STOP') {
      // Another screening at the same cinema is a valid swap; another
      // dinner at the same restaurant is not.
      if (target.key.startsWith('s:')) spec.excludedKeys.push(target.key);
      else spec.excludedPlaceIds.push(target.placeId);
    } else spec.removedSlotId = target.slotId;
    // When the anchor itself changes, its time may move to fit the new one.
    if (target.slotRole === 'ANCHOR') spec.anchorStart = null;
    return spec;
  }
  if (action === 'MORE_ORIGINAL')
    spec.excludedPlaceIds = [...new Set(stops.map((stop) => stop.placeId))];
  return spec;
}

/** A facet the person asked for by tapping a refinement. */
function said(
  dimension: IntentFacet['dimension'],
  value: string,
  phrase: string,
): IntentFacet {
  return {
    dimension,
    value,
    polarity: 'want',
    strength: 'soft',
    provenance: 'explicit',
    confidence: 1,
    phrase,
  };
}

/** The intent of the refined request. */
export function refineIntent(
  intent: PlanIntent,
  spec: RefinementSpec,
): PlanIntent {
  const next: PlanIntent = {
    ...intent,
    vibe: [...intent.vibe],
    avoid: [...intent.avoid],
    facets: [...(intent.facets ?? [])],
    location: { ...intent.location },
    when: { ...intent.when },
  };
  switch (spec.action) {
    case 'CHEAPER':
      next.pricePreference = 'cheap';
      break;
    case 'MORE_ROMANTIC':
      next.occasion =
        intent.occasion === 'first_date' ? 'first_date' : 'romantic';
      if (!next.vibe.includes('romantic')) next.vibe.push('romantic');
      break;
    case 'LESS_TRAVEL':
      next.location.travelTolerance = 'low';
      break;
    case 'MORE_ORIGINAL':
      next.novelty = 'new';
      break;
    case 'MORE_CALM':
      // Quieter replaces any lively / social-energy reading.
      next.facets = [
        ...(next.facets ?? []).filter(
          (facet) =>
            !(
              facet.dimension === 'energy' &&
              ['lively', 'high_energy', 'social'].includes(facet.value)
            ),
        ),
        said('energy', 'quiet', 'más tranqui'),
      ];
      next.vibe = [...next.vibe.filter((trait) => trait !== 'lively'), 'quiet'];
      next.avoid = [...new Set([...next.avoid, 'lively' as const])];
      break;
    case 'MORE_MODERN':
      next.facets = [
        ...(next.facets ?? []).filter(
          (facet) =>
            !(facet.dimension === 'style' && facet.value === 'traditional'),
        ),
        said('style', 'modern', 'más moderno'),
        said('style', 'trendy', 'más moderno'),
      ];
      next.vibe = [
        ...new Set([
          ...next.vibe.filter((trait) => trait !== 'traditional'),
          'trendy' as const,
        ]),
      ];
      next.avoid = [
        ...new Set([
          ...next.avoid.filter((trait) => trait !== 'trendy'),
          'traditional' as const,
          'fast_food' as const,
        ]),
      ];
      break;
    default:
      break;
  }
  // Unchanged stops keep their times: the plan starts where it started.
  if (spec.anchorStart !== null && !intent.when.now)
    next.when.startMinutes = spec.anchorStart;
  return next;
}
