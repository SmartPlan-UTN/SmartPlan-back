/**
 * The solver turns ranked, statically feasible candidates into executable
 * plans: a timeline with travel, every stop open (or plausibly open) when the
 * person arrives, the group's money respected, and three intentionally
 * different options instead of a list of near-duplicates.
 *
 * It is deterministic and runs in milliseconds over a few hundred
 * candidates, so refinements ("mÃ¡s barato", "cambiar esta parada") can be
 * solved synchronously.
 */
import {
  computePlanTotals,
  type PlanPriceTotals,
} from '../../common/pricing/price';
import type { TravelMode } from '../../common/types/travel-mode';
import type { PlanCandidate } from '../candidate';
import {
  combine,
  timedFeasibility,
  type Feasibility,
} from '../feasibility/feasibility';
import { EXPERIENCES, type ExperienceKey } from '../intent/experiences';
import { partySize, type PlanIntent } from '../intent/plan-intent';
import type { RankedCandidate } from '../ranking/ranking';
import type { PlanShape, PlanSlot, SlotRole } from '../shape/plan-shape';
import { ceilToQuarter, weekdayOf } from '../time';
import { isDecisionGrade } from '../decision-grade';
import { hasUnconfirmedContext } from '../traits/context-evidence';

export type ProposalRole = 'BEST' | 'VALUE' | 'DIFFERENT' | 'ALTERNATIVE';

export interface PlannedStop {
  ranked: RankedCandidate;
  slotId: string;
  slotRole: SlotRole;
  experience: ExperienceKey;
  /** Local minutes from the plan date's midnight. */
  start: number;
  end: number;
  travelMinutesFromPrevious: number;
  legKmFromPrevious: number;
  feasibility: Feasibility;
}

/**
 * Whether the whole plan fits the person's money, from evidence only:
 * - WITHIN: every stop is priced with an upper bound and the total fits.
 * - UNCERTAIN: something is unpriced or open-ended ("desde"), and the known
 *   part does not already exceed it. Possible, never presented as a fit.
 * - EXCEEDS: what is already known costs more than the budget.
 */
export type BudgetStatus = 'WITHIN' | 'UNCERTAIN' | 'EXCEEDS' | 'NO_BUDGET';

export interface PlanProposal {
  role: ProposalRole;
  stops: PlannedStop[];
  start: number;
  end: number;
  travelMinutes: number;
  travelKm: number;
  totals: PlanPriceTotals;
  budgetStatus: BudgetStatus;
  score: number;
  /**
   * Every stop has a known opening state for its time and a usable price:
   * SmartPlan can actively recommend it (see decision-grade.ts).
   */
  decisionGrade?: boolean;
  /** Explicit atmosphere is substantiated, independently of price and hours. */
  contextGrade?: boolean;
  /** Known hours and prices for every stop (budget fit not required). */
  evidenceGrade?: boolean;
}

export interface SolveInput {
  intent: PlanIntent;
  shape: PlanShape;
  candidatesBySlot: Map<string, RankedCandidate[]>;
  /** Places the solver must keep (refinement pins), by slot id. */
  pinned?: Map<string, RankedCandidate>;
  /** Places the solver must not use (refinement removals / swaps). */
  excludedPlaceIds?: Set<number>;
  /** Candidates the solver must not use (a swapped screening). */
  excludedKeys?: Set<string>;
}

export interface SolveResult {
  proposals: PlanProposal[];
  /** Plans built before choosing roles (for the funnel). */
  combinationsEvaluated: number;
  /** Timed rejections, by reason, while building (for the trace). */
  timedRejections: Record<string, number>;
}

const SPEED_KM_PER_HOUR: Record<TravelMode, number> = {
  drive: 25,
  walk: 4.5,
  bicycle: 12,
};
const DETOUR = 1.3;
const ANCHOR_BEAM = 14;
const OPTIONAL_MIN_SCORE = 0.42;

export function haversineKm(
  a: { latitude: number | null; longitude: number | null; location?: string },
  b: { latitude: number | null; longitude: number | null; location?: string },
): number | null {
  // Between two stops at home nobody moves; to or from a home with no known
  // position the leg is not measurable and counts as nothing.
  if (a.location === 'HOME' && b.location === 'HOME') return 0;
  if (
    (a.location === 'HOME' && (a.latitude == null || a.longitude == null)) ||
    (b.location === 'HOME' && (b.latitude == null || b.longitude == null))
  )
    return 0;
  if (
    a.location === 'APPROXIMATE' ||
    b.location === 'APPROXIMATE' ||
    a.latitude == null ||
    a.longitude == null ||
    b.latitude == null ||
    b.longitude == null
  )
    return null;
  const rad = Math.PI / 180;
  const value =
    Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, value)));
}

/** Conservative door-to-door minutes for a leg (never advertised as a route). */
export function legMinutes(km: number | null, mode: TravelMode): number {
  if (km === null) return 15;
  if (km < 0.15) return 0;
  // Parking/getting going costs a few minutes when driving.
  const overhead = mode === 'drive' ? 5 : 0;
  return Math.ceil((km * DETOUR * 60) / SPEED_KM_PER_HOUR[mode]) + overhead;
}

/**
 * How long an optional extra's leg may take: an extra is worth a short hop,
 * never a second trip (a museum two hours away is not "and then").
 */
function maxOptionalLegMinutes(intent: PlanIntent): number {
  if (intent.location.travelMode === 'walk') return 15;
  switch (intent.location.travelTolerance) {
    case 'low':
      return 10;
    case 'medium':
      return 20;
    case 'high':
      return 35;
  }
}

/** Longest idle wait before an optional extra (it should flow, not stall). */
const MAX_OPTIONAL_GAP = 45;

/** How far one leg may be, given how much the person wants to move. */
function maxLegKm(intent: PlanIntent): number {
  if (intent.location.travelMode === 'walk') return 2;
  switch (intent.location.travelTolerance) {
    case 'low':
      return 3;
    case 'medium':
      return 9;
    case 'high':
      return 70;
  }
}

/** The person asked to walk, be outdoors, or not spend. */
export function wantsWalk(intent: PlanIntent): boolean {
  return (
    intent.experiences.some(
      ({ key }) => key === 'walk' || key === 'viewpoint',
    ) ||
    intent.vibe.includes('outdoor') ||
    intent.constraints.freeOnly
  );
}

function stopDuration(candidate: PlanCandidate): number {
  return Math.max(15, candidate.durationMinutes);
}

function totalsOf(stops: PlannedStop[], intent: PlanIntent): PlanPriceTotals {
  return computePlanTotals(
    stops.map((stop) => stop.ranked.candidate.price),
    partySize(intent),
  );
}

export function budgetStatusOf(
  totals: PlanPriceTotals,
  intent: Pick<PlanIntent, 'budget'>,
): BudgetStatus {
  if (!intent.budget) return 'NO_BUDGET';
  const limit = intent.budget.amount;
  if (totals.totalMin !== null && totals.totalMin > limit) return 'EXCEEDS';
  if (
    totals.unpricedCount === 0 &&
    totals.totalMax !== null &&
    totals.totalMax <= limit
  )
    return 'WITHIN';
  return 'UNCERTAIN';
}

/** Whether the plan still respects the hard money and time limits. */
function withinLimits(stops: PlannedStop[], intent: PlanIntent): boolean {
  const totals = totalsOf(stops, intent);
  if (
    intent.budget?.strict &&
    totals.totalMin !== null &&
    totals.totalMin > intent.budget.amount
  )
    return false;
  if (intent.durationMinutes !== null && stops.length) {
    const span = stops[stops.length - 1].end - stops[0].start;
    if (span > intent.durationMinutes) return false;
  }
  return true;
}

interface Builder {
  intent: PlanIntent;
  weekday: number;
  rejections: Record<string, number>;
  excludedKeys?: ReadonlySet<string>;
}

function placeStop(
  builder: Builder,
  ranked: RankedCandidate,
  slot: PlanSlot,
  start: number,
  previous: PlanCandidate | null,
): PlannedStop | null {
  const candidate = ranked.candidate;
  const end = start + stopDuration(candidate);
  // A meal happens in its moment: a lunch at 18:15 is not a lunch.
  const definition = EXPERIENCES[ranked.experience];
  if (definition.meal && definition.moment) {
    const [windowStart, windowEnd] = definition.window;
    if (start < windowStart - 30 || start > windowEnd) {
      builder.rejections.outside_meal_moment =
        (builder.rejections.outside_meal_moment ?? 0) + 1;
      return null;
    }
  }
  const timed = timedFeasibility(candidate, builder.weekday, start, end);
  if (timed.verdict === 'INFEASIBLE') {
    for (const reason of timed.reasons)
      builder.rejections[reason] = (builder.rejections[reason] ?? 0) + 1;
    return null;
  }
  const km = previous ? haversineKm(previous, candidate) : null;
  return {
    ranked,
    slotId: slot.id,
    slotRole: slot.role,
    experience: ranked.experience,
    start,
    end,
    travelMinutesFromPrevious: previous
      ? legMinutes(km, builder.intent.location.travelMode)
      : 0,
    legKmFromPrevious: previous ? (km ?? 0) : 0,
    feasibility: combine(ranked.feasibility, timed),
  };
}

/** A screening anchor starts at its time, if that fits the request. */
function fixedAnchorStarts(fixed: number, intent: PlanIntent): number[] {
  if (intent.when.now && intent.when.startMinutes !== null)
    return fixed >= intent.when.startMinutes &&
      fixed - intent.when.startMinutes <= 60
      ? [fixed]
      : [];
  if (intent.when.startMinutes !== null && !intent.when.now)
    return Math.abs(fixed - intent.when.startMinutes) <= 60 ? [fixed] : [];
  return [fixed];
}

/** Candidate starts for an anchor: the preferred time, then nearby times. */
function anchorStarts(
  shape: PlanShape,
  intent: PlanIntent,
  experience: ExperienceKey,
): number[] {
  if (intent.when.startMinutes !== null && !intent.when.now)
    return [intent.when.startMinutes];
  const preferred = shape.anchorPreferredStart;
  const [windowStart, windowEnd] = EXPERIENCES[experience].window;
  return [preferred, preferred + 30, preferred - 30, preferred + 60]
    .filter((time) => time >= windowStart - 30 && time <= windowEnd)
    .filter((time) => !intent.when.now || time >= preferred);
}

function bestCompanion(
  builder: Builder,
  slot: PlanSlot,
  options: RankedCandidate[],
  used: Set<number>,
  usedKeys: Set<string>,
  anchor: PlanCandidate,
  timeAt: (candidate: PlanCandidate) => number | null,
  previous: PlanCandidate | null,
  excluded: Set<number>,
): PlannedStop | null {
  const maxKm = maxLegKm(builder.intent);
  let best: { stop: PlannedStop; value: number } | null = null;
  for (const ranked of options) {
    const candidate = ranked.candidate;
    if (
      usedKeys.has(candidate.key) ||
      excluded.has(candidate.placeId) ||
      builder.excludedKeys?.has(candidate.key)
    )
      continue;
    // A winery's tasting and its lunch are two real experiences of one
    // visit (and bodega to bodega is the plan in wine country); any other
    // place appears once and never the same kind twice in a row.
    const experienceVisit =
      candidate.kind === 'OFFERING' &&
      candidate.stopPolicy === 'OFFERING_REQUIRED';
    // Going home is the close of the plan, however far home is; and a
    // second game at home is a real stop, not padding.
    const home = candidate.location === 'HOME';
    if (used.has(candidate.placeId) && !experienceVisit) continue;
    if (!slot.required && ranked.score < OPTIONAL_MIN_SCORE) continue;
    // Missing evidence is carried into the plan's caveats and budget status.
    // It is not a reason to reduce every outing to its anchor. Opening
    // feasibility is checked at the actual arrival time below, never at noon.
    // A generic plaza is only worth adding when the person wants to walk.
    if (candidate.connective && !wantsWalk(builder.intent)) continue;
    const km = haversineKm(anchor, candidate);
    // An optional extra must have a real, checkable connection to the anchor.
    if (km === null && !slot.required) continue;
    if (!home && km !== null && km > maxKm) continue;
    if (
      !home &&
      !slot.required &&
      legMinutes(km, builder.intent.location.travelMode) >
        maxOptionalLegMinutes(builder.intent)
    )
      continue;
    // Two experiences at one venue are a plan only when both were asked
    // for (a tasting and the lunch); an optional second one is padding.
    if (used.has(candidate.placeId) && !slot.required && !home) continue;
    if (
      candidate.placeKind &&
      candidate.placeKind === anchor.placeKind &&
      !experienceVisit
    )
      continue;
    let start = timeAt(candidate);
    if (start === null) continue;
    if (candidate.fixedStart !== undefined) {
      // A screening is at its time: after the previous stop it may wait a
      // little (≤45 min); before the next one it must end in time.
      const fixed = candidate.fixedStart;
      if (previous) {
        if (fixed < start || fixed - start > 45) continue;
      } else if (fixed > start || start - fixed > 45) continue;
      start = fixed;
    }
    const stop = placeStop(builder, ranked, slot, start, previous ?? anchor);
    if (!stop) continue;
    const value =
      ranked.score -
      (km ?? 2) * 0.012 +
      (isDecisionGrade(candidate, builder.weekday, start) ? 0.04 : 0);
    if (!best || value > best.value) best = { stop, value };
  }
  return best?.stop ?? null;
}

/** Idle minutes before stop `index` (after the previous stop and its leg). */
function idleBefore(stops: PlannedStop[], index: number): number {
  if (index === 0) return 0;
  return Math.max(
    0,
    stops[index].start -
      stops[index - 1].end -
      stops[index].travelMinutesFromPrevious,
  );
}

function scorePlan(stops: PlannedStop[], intent?: PlanIntent): number {
  let score = 0;
  if (intent?.budget) {
    // Money is a promise: a plan we can show fits beats one we only hope fits.
    const status = budgetStatusOf(totalsOf(stops, intent), intent);
    if (status === 'WITHIN') score += intent.budget.strict ? 0.06 : 0.03;
    if (status === 'UNCERTAIN') score -= intent.budget.strict ? 0.06 : 0.02;
  }
  for (const stop of stops) {
    score += stop.ranked.score * (stop.slotRole === 'ANCHOR' ? 1 : 0.35);
    score -= stop.travelMinutesFromPrevious * 0.0015;
    if (stop.feasibility.verdict === 'UNCERTAIN') score -= 0.01;
  }
  return Math.round(score * 10000) / 10000;
}

/** Builds the best executable plan around one first-anchor candidate. */
function buildAround(
  builder: Builder,
  input: SolveInput,
  anchor: RankedCandidate,
  anchorIndex: number,
  anchorStart: number,
): PlannedStop[] | null {
  const { shape, candidatesBySlot, intent } = input;
  const excluded = input.excludedPlaceIds ?? new Set<number>();
  const anchorSlot = shape.slots[anchorIndex];
  const anchorStop = placeStop(builder, anchor, anchorSlot, anchorStart, null);
  if (!anchorStop) return null;

  const used = new Set<number>([anchor.candidate.placeId]);
  const usedKeys = new Set<string>([anchor.candidate.key]);
  const before: PlannedStop[] = [];
  const after: PlannedStop[] = [];

  // Slots before the anchor, scheduled backwards so they end on time.
  for (let index = anchorIndex - 1; index >= 0; index -= 1) {
    const slot = shape.slots[index];
    const next = before[0]?.ranked.candidate ?? anchor.candidate;
    const nextStart = before[0]?.start ?? anchorStop.start;
    const pinned = input.pinned?.get(slot.id);
    const options = pinned ? [pinned] : (candidatesBySlot.get(slot.id) ?? []);
    const stop = bestCompanion(
      builder,
      slot,
      options,
      used,
      usedKeys,
      next,
      (candidate) => {
        const km = haversineKm(candidate, next);
        // People meet at human times: round the start down to a quarter.
        return (
          Math.floor(
            (nextStart -
              legMinutes(km, intent.location.travelMode) -
              stopDuration(candidate)) /
              15,
          ) * 15
        );
      },
      null,
      excluded,
    );
    if (!stop) {
      if (slot.required) return null;
      continue;
    }
    used.add(stop.ranked.candidate.placeId);
    usedKeys.add(stop.ranked.candidate.key);
    before.unshift(stop);
  }
  // Slots after the anchor, scheduled forwards.
  let cursor = anchorStop;
  for (let index = anchorIndex + 1; index < shape.slots.length; index += 1) {
    const slot = shape.slots[index];
    const pinned = input.pinned?.get(slot.id);
    const options = pinned ? [pinned] : (candidatesBySlot.get(slot.id) ?? []);
    const from = cursor.ranked.candidate;
    const fromEnd = cursor.end;
    const stop = bestCompanion(
      builder,
      slot,
      options,
      used,
      usedKeys,
      from,
      (candidate) => {
        const km = haversineKm(from, candidate);
        const arrive = fromEnd + legMinutes(km, intent.location.travelMode);
        // A later anchor waits for its natural moment, within reason.
        if (slot.role === 'ANCHOR') {
          const [windowStart] = EXPERIENCES[slot.experiences[0]].window;
          if (arrive < windowStart && windowStart - arrive <= 90)
            return windowStart;
        }
        return ceilToQuarter(arrive);
      },
      from,
      excluded,
    );
    if (!stop) {
      if (slot.required) return null;
      continue;
    }
    used.add(stop.ranked.candidate.placeId);
    usedKeys.add(stop.ranked.candidate.key);
    after.push(stop);
    cursor = stop;
  }

  let stops = relink([...before, anchorStop, ...after], intent);
  // An optional extra that leaves the person waiting is not "and then".
  stops = relink(
    stops.filter(
      (stop, index) =>
        stop.slotRole === 'ANCHOR' ||
        (idleBefore(stops, index) <= MAX_OPTIONAL_GAP &&
          (index === stops.length - 1 ||
            stops[index + 1].slotRole !== 'ANCHOR' ||
            idleBefore(stops, index + 1) <= MAX_OPTIONAL_GAP)),
    ),
    intent,
  );
  // Drop optional companions (latest first) until the hard limits hold.
  while (!withinLimits(stops, intent)) {
    const optionalIndex = [...stops]
      .map((stop, index) => ({ stop, index }))
      .reverse()
      .find(
        ({ stop }) =>
          stop.slotId !== anchorSlot.id &&
          !shape.slots.find((slot) => slot.id === stop.slotId)?.required,
      )?.index;
    if (optionalIndex === undefined) return null;
    stops = relink(
      stops.filter((_, index) => index !== optionalIndex),
      intent,
    );
  }
  return stops;
}

/** Recomputes every leg from the final order (the first stop has none). */
function relink(stops: PlannedStop[], intent: PlanIntent): PlannedStop[] {
  return stops.map((stop, index) => {
    if (index === 0)
      return { ...stop, travelMinutesFromPrevious: 0, legKmFromPrevious: 0 };
    const km = haversineKm(
      stops[index - 1].ranked.candidate,
      stop.ranked.candidate,
    );
    return {
      ...stop,
      travelMinutesFromPrevious: legMinutes(km, intent.location.travelMode),
      legKmFromPrevious: km ?? 0,
    };
  });
}

function toProposal(stops: PlannedStop[], intent: PlanIntent): PlanProposal {
  const totals = totalsOf(stops, intent);
  const weekday = weekdayOf(intent.when.date);
  const evidenceGrade = stops.every((stop) =>
    isDecisionGrade(stop.ranked.candidate, weekday, stop.start),
  );
  const contextGrade = !hasUnconfirmedContext(
    intent,
    stops.map((stop) => stop.ranked.candidate),
  );
  return {
    role: 'ALTERNATIVE',
    evidenceGrade,
    contextGrade,
    // A strict budget is part of the decision: only a plan whose upper
    // bound fits is a plan SmartPlan can recommend for that money.
    decisionGrade:
      evidenceGrade &&
      contextGrade &&
      (!intent.budget?.strict || budgetStatusOf(totals, intent) === 'WITHIN'),
    stops,
    start: stops[0].start,
    end: stops[stops.length - 1].end,
    travelMinutes: stops.reduce(
      (sum, stop) => sum + stop.travelMinutesFromPrevious,
      0,
    ),
    travelKm:
      Math.round(
        stops.reduce((sum, stop) => sum + stop.legKmFromPrevious, 0) * 10,
      ) / 10,
    totals,
    budgetStatus: budgetStatusOf(totals, intent),
    score: scorePlan(stops, intent),
  };
}

const signature = (proposal: PlanProposal) =>
  proposal.stops.map((stop) => stop.ranked.candidate.key).join('|');

/** What makes two options "the same": venues, but a screening is its own. */
/** Stops kept by a refinement: shared by every option on purpose. */
let SHARED_KEYS: ReadonlySet<string> = new Set();

/**
 * A screening, or a game at home, is an option of its own: several of them
 * share one venue (a cinema, the Hogar) and are still different plans.
 */
const ownOption = (candidate: PlanCandidate) =>
  candidate.kind === 'SCREENING' || candidate.location === 'HOME';

const placesOf = (proposal: PlanProposal) =>
  new Set(
    proposal.stops
      .filter((stop) => !SHARED_KEYS.has(stop.ranked.candidate.key))
      .map((stop) =>
        ownOption(stop.ranked.candidate)
          ? stop.ranked.candidate.key
          : String(stop.ranked.candidate.placeId),
      ),
  );

const anchorOf = (proposal: PlanProposal) =>
  proposal.stops.find((stop) => stop.slotRole === 'ANCHOR') ??
  proposal.stops[0];

const GENERIC_NAME_WORDS = new Set([
  'bar',
  'resto',
  'cafe',
  'the',
  'los',
  'las',
  'del',
  'sucursal',
]);

/** A venue name's distinctive words ("Berlina Arístides" → berlina, aristides). */
function nameTokens(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !GENERIC_NAME_WORDS.has(word));
}

/**
 * Two branches of one brand: one name's distinctive words are all in the
 * other's ("Berlina" ⊂ "Berlina Arístides"); "Bodega A" vs "Bodega B" are
 * different venues.
 */
export function sameBrand(a: string, b: string): boolean {
  const left = nameTokens(a);
  const right = nameTokens(b);
  if (!left.length || !right.length) return false;
  const [short, long] =
    left.length <= right.length
      ? [left, new Set(right)]
      : [right, new Set(left)];
  return short.every((word) => long.has(word));
}

/** Venue names, for brands; a game at home has no brand (its key is its identity). */
const namesOf = (proposal: PlanProposal) =>
  proposal.stops
    .filter((stop) => stop.ranked.candidate.location !== 'HOME')
    .map((stop) => stop.ranked.candidate.placeName);

/** Shares a venue or a brand (another branch is not another option). */
function overlaps(a: PlanProposal, chosen: PlanProposal[]): boolean {
  const places = placesOf(a);
  const names = namesOf(a);
  return chosen.some(
    (other) =>
      [...placesOf(other)].some((placeId) => places.has(placeId)) ||
      namesOf(other).some((name) => names.some((own) => sameBrand(own, name))),
  );
}

/** Lower-bound cost of a proposal, or null when nothing is priced. */
const costOf = (proposal: PlanProposal) => proposal.totals.totalMin;

/** Every stop has a bounded price; a FROM minimum cannot prove savings. */
export function isFullyPriced(proposal: PlanProposal): boolean {
  return (
    proposal.totals.unpricedCount === 0 &&
    proposal.totals.totalMin !== null &&
    proposal.totals.totalMax !== null
  );
}

/**
 * Picks up to three differentiated proposals:
 * - BEST: the strongest plan.
 * - VALUE: a clearly cheaper plan of comparable quality (known prices only).
 * - DIFFERENT: no shared place and a different kind of anchor or area.
 * Remaining slots are filled with the next non-overlapping plans
 * (ALTERNATIVE) so a thin catalogue still answers.
 */
export function chooseProposals(
  plans: PlanProposal[],
  limit = 3,
): PlanProposal[] {
  // Evidence resolves close choices; it must not erase a materially better
  // contextual fit or remove honest, uncertain alternatives from the list.
  const preference = (plan: PlanProposal) =>
    plan.score + (plan.decisionGrade ? 0.03 : plan.evidenceGrade ? 0.015 : 0);
  const ranked = [...plans].sort(
    (a, b) =>
      Number(b.contextGrade ?? true) - Number(a.contextGrade ?? true) ||
      preference(b) - preference(a) ||
      b.score - a.score,
  );
  if (!ranked.length) return [];
  const best = { ...ranked[0], role: 'BEST' as const };
  const chosen: PlanProposal[] = [best];

  // Money is compared only between fully priced plans: an unknown price is
  // never "cheaper".
  const bestCost = isFullyPriced(best) ? costOf(best) : null;
  // Nothing is cheaper than free: no "value" option next to a free plan.
  const value = ranked.find((plan) => {
    if (bestCost === 0) return false;
    if (overlaps(plan, chosen)) return false;
    if (
      !isFullyPriced(plan) ||
      (plan.budgetStatus !== 'WITHIN' && plan.budgetStatus !== 'NO_BUDGET')
    )
      return false;
    const cost = plan.totals.totalMax!;
    if (bestCost === null) return plan.score >= best.score * 0.85;
    return cost <= bestCost * 0.85 && plan.score >= best.score * 0.8;
  });
  if (value) chosen.push({ ...value, role: 'VALUE' });

  const bestAnchor = anchorOf(best).ranked.candidate;
  const different = ranked
    .filter((plan) => !overlaps(plan, chosen))
    .map((plan) => {
      const anchor = anchorOf(plan).ranked.candidate;
      const otherKind = anchor.placeKind !== bestAnchor.placeKind ? 0.06 : 0;
      const km = haversineKm(anchor, bestAnchor);
      const otherArea = km !== null && km > 3 ? 0.04 : 0;
      const otherShape =
        plan.stops.map((stop) => stop.experience).join() !==
        best.stops.map((stop) => stop.experience).join()
          ? 0.04
          : 0;
      const distinction = otherKind + otherArea + otherShape;
      return { plan, distinction, value: plan.score + distinction };
    })
    .filter(({ distinction }) => distinction > 0)
    .sort((a, b) => b.value - a.value)[0]?.plan;
  if (different && chosen.length < limit)
    chosen.push({ ...different, role: 'DIFFERENT' });

  for (const plan of ranked) {
    if (chosen.length >= limit) break;
    if (!overlaps(plan, chosen)) chosen.push({ ...plan, role: 'ALTERNATIVE' });
  }
  return chosen.slice(0, limit);
}

export function solve(input: SolveInput): SolveResult {
  const { intent, shape, candidatesBySlot } = input;
  const builder: Builder = {
    intent,
    weekday: weekdayOf(intent.when.date),
    rejections: {},
  };
  const anchorIndex = shape.slots.findIndex((slot) => slot.role === 'ANCHOR');
  if (anchorIndex < 0)
    return { proposals: [], combinationsEvaluated: 0, timedRejections: {} };
  const anchorSlot = shape.slots[anchorIndex];
  const excluded = input.excludedPlaceIds ?? new Set<number>();
  const excludedKeys = input.excludedKeys ?? new Set<string>();
  SHARED_KEYS = new Set(
    [...(input.pinned?.values() ?? [])].map((r) => r.candidate.key),
  );
  // A copy: games at home used by one option are excluded from the next.
  const companionExcluded = new Set(excludedKeys);
  builder.excludedKeys = companionExcluded;
  // Pinned stops stay in every option (they are the plan being refined).
  const pinnedPlaces = new Set(
    [...(input.pinned?.values() ?? [])].map((r) => r.candidate.placeId),
  );
  const pinnedAnchor = input.pinned?.get(anchorSlot.id);

  // One anchor per place: five activities of the same winery are one choice.
  const anchors: RankedCandidate[] = [];
  const seenPlaces = new Set<number>();
  for (const ranked of pinnedAnchor
    ? [pinnedAnchor]
    : (candidatesBySlot.get(anchorSlot.id) ?? [])) {
    if (excluded.has(ranked.candidate.placeId)) continue;
    if (excludedKeys.has(ranked.candidate.key)) continue;
    // Several screenings of one cinema, or games at home, are several
    // real options.
    if (
      !ownOption(ranked.candidate) &&
      seenPlaces.has(ranked.candidate.placeId)
    )
      continue;
    // A generic plaza is never the anchor unless a walk was asked for.
    if (ranked.candidate.connective && !anchorSlot.experiences.includes('walk'))
      continue;
    seenPlaces.add(ranked.candidate.placeId);
    anchors.push(ranked);
  }

  let evaluated = 0;
  const buildAll = (exclude: Set<number>): PlanProposal[] => {
    const plans: PlanProposal[] = [];
    for (const anchor of anchors) {
      // Spend the beam on executable anchors, not on closed high-ranked venues.
      if (plans.length >= ANCHOR_BEAM) break;
      if (exclude.has(anchor.candidate.placeId)) continue;
      if (usedScreenings.has(anchor.candidate.key)) continue;
      const fixed = anchor.candidate.fixedStart;
      const starts =
        fixed === undefined
          ? anchorStarts(shape, intent, anchor.experience)
          : fixedAnchorStarts(fixed, intent);
      for (const start of starts) {
        evaluated += 1;
        const stops = buildAround(
          builder,
          { ...input, excludedPlaceIds: exclude },
          anchor,
          anchorIndex,
          start,
        );
        if (stops?.length) {
          plans.push(toProposal(stops, intent));
          break;
        }
      }
    }
    return plans;
  };

  // Three rounds: after each choice, the next options are rebuilt without
  // the places already used, so alternatives get their own companions
  // instead of all sharing the best cafÃ© or the same plaza.
  const chosen: PlanProposal[] = [];
  const used = new Set<number>(excluded);
  const usedScreenings = new Set<string>();
  for (let round = 0; round < 3; round += 1) {
    const plans = buildAll(used);
    const taken = new Set(chosen.map(signature));
    const next = chooseProposals([...chosen, ...plans], chosen.length + 1).find(
      (plan) => !taken.has(signature(plan)),
    );
    if (!next) break;
    chosen.push(next);
    for (const stop of next.stops) {
      // Another screening (another film or time), or another game at home,
      // is still a fair option; other venues are not repeated.
      if (ownOption(stop.ranked.candidate)) {
        usedScreenings.add(stop.ranked.candidate.key);
        // A game at home is not offered again as another option's companion.
        if (stop.ranked.candidate.location === 'HOME')
          companionExcluded.add(stop.ranked.candidate.key);
      } else if (!pinnedPlaces.has(stop.ranked.candidate.placeId))
        used.add(stop.ranked.candidate.placeId);
    }
  }
  const proposals = chooseProposals(chosen, 3);
  // solve() is synchronous: the shared set never outlives this call.
  SHARED_KEYS = new Set();
  return {
    proposals,
    combinationsEvaluated: evaluated,
    timedRejections: builder.rejections,
  };
}
