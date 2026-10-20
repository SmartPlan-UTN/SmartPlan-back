import { Optional, Injectable, Logger } from '@nestjs/common';
import type { RefinementSpec } from './refinement/refinement';
import type { PlanCandidate } from './candidate';
import {
  candidateCostMin,
  combine,
  staticFeasibility,
  timedFeasibility,
  type Feasibility,
} from './feasibility/feasibility';
import {
  EXPERIENCES,
  isExperienceKey,
  type ExperienceKey,
} from './intent/experiences';
import { partySize, type PlanIntent } from './intent/plan-intent';
import { narrate, type ProposalNarration } from './narration/narration';
import {
  EMPTY_PERSONAL_SIGNALS,
  rankCandidate,
  satisfiedExperience,
  RANKING_VERSION,
  type PersonalSignals,
  type RankedCandidate,
} from './ranking/ranking';
import { PersonalSignalsService } from './ranking/personal-signals.service';
import { rotationSpan } from './ranking/rotation';
import {
  CandidateRetrievalService,
  type SearchArea,
} from './retrieval/candidate-retrieval.service';
import {
  buildPlanShape,
  preferredStartOf,
  scheduleIntent,
  type PlanShape,
} from './shape/plan-shape';
import { haversineKm, solve, type PlanProposal } from './solver/solver';
import { weekdayOf } from './time';
import {
  LiveVerificationService,
  type VerificationOutcome,
} from './verification/live-verification.service';
import { KnowledgeSignalsService } from '../knowledge/knowledge-signals.service';
import { hoursKnownFor } from './candidate';
import { isDecisionGrade, NOT_DECISION_GRADE_PENALTY } from './decision-grade';
import { computePlanTotals, priceConfidence } from '../common/pricing/price';
import { effectsOf } from './intent/semantics';
import { understandingOf } from './intent/understanding';

/**
 * Deterministic jitter in [0, span) from a seed and a place: venues that
 * nothing distinguishes take turns across requests instead of one winning
 * every time.
 */
export function tieBreak(seed: string, placeId: number, span = 0.012): number {
  let hash = 2166136261;
  for (const char of `${seed}#${placeId}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (((hash >>> 0) % 1000) / 1000) * span;
}

/** Ranked candidates kept per slot: broad enough for diversity. */
const SLOT_SHORTLIST = 120;
/** Extra live checks reserved for the recommended plan's own unresolved stops. */
const BEST_PLAN_EXTRA_CHECKS = 2;
/** Finalist places whose missing facts may be verified live. */
const FINALIST_PLACES = 10;

export interface EngineInput {
  intent: PlanIntent;
  rawQuery: string | null;
  requestedAt: Date;
  idUser: number | null;
  /** Refinement: keep these stops (by slot id) and avoid these places. */
  pinnedKeys?: Map<string, string>;
  excludedPlaceIds?: Set<number>;
  /** A refinement of a previous plan (keeps its shape and pinned stops). */
  refinement?: RefinementSpec;
  /** Skip live verification (evaluation fixtures, refinement). */
  offline?: boolean;
}

/** Real counts of what the planner did; never invented progress. */
export interface EngineTrace {
  rankingVersion: string;
  intentVersion: number;
  shape: { id: string; role: string; experiences: string[] }[];
  unsupportedExperiences: ExperienceKey[];
  /** The named zone had too few options; nearby places were included. */
  zoneFallback?: boolean;
  /**
   * Why there is no (or no proven) answer, and the nearest real alternative,
   * so the person gets a useful "not like this" instead of an empty screen.
   */
  diagnostics?: PlanDiagnostics;
  area: SearchArea | null;
  universePlaces: number;
  candidates: number;
  staticRejected: Record<string, number>;
  feasible: number;
  uncertain: number;
  anchorFunnel: {
    experience: ExperienceKey;
    places: number;
    feasible: number;
    openAtTime: number;
    confirmedOpenAtTime: number;
    knownWithinBudget: number | null;
    /** Open places with some price information (any source). */
    withPrice: number;
    /** Open places whose own evidence supports the character asked for. */
    fitsCharacter: number;
    /** The character in the person's words ("Fachero", "Tranqui"). */
    character: string | null;
  } | null;
  shortlist: Record<string, number>;
  combinationsEvaluated: number;
  timedRejections: Record<string, number>;
  verification: {
    locations: number;
    hours: number;
    /** Unknown prices resolved by the same live checks. */
    prices: number;
    skipped: string | null;
  };
  /** What the live ID-only search for this idea found (request-scoped). */
  live?: { queries: string[]; ids: number; known: number; durationMs: number };
  /** The recommended plan has known hours and prices for every stop. */
  bestDecisionGrade?: boolean;
  /**
   * Distinct places SmartPlan ruled out, by reason (real pipeline counts,
   * for "SmartPlan descartó por vos").
   */
  discarded?: {
    overBudget: number;
    tooFar: number;
    closedForGood: number;
    /** Main-experience places closed at the planned time. */
    closedAtTime: number;
  };
  proposals: number;
  durationMs: number;
  timings?: { retrievalMs: number; verificationMs: number; solvingMs: number };
}

export interface PlanDiagnostics {
  reason: 'BUDGET' | 'UNSUPPORTED' | 'NOTHING_OPEN' | 'NO_CANDIDATES' | null;
  /** Cheapest group total of the requested experiences, from known prices. */
  cheapestKnownTotal: number | null;
  /** Requested experiences with no plannable option. */
  unsupported: ExperienceKey[];
  /** Candidates rejected because they were closed at the needed time. */
  closedAtTime: number;
}

export interface EngineResult {
  /** The intent actually planned (e.g. moved to tomorrow when today's window passed). */
  intent: PlanIntent;
  proposals: PlanProposal[];
  narrations: ProposalNarration[];
  shape: PlanShape;
  trace: EngineTrace;
  /** Every ranked candidate per slot (refinement alternatives). */
  ranked: Map<string, RankedCandidate[]>;
}

/**
 * The planning engine, shared by automatic generation, refinement and the
 * manual composer: UNDERSTAND (PlanIntent) → RETRIEVE (broad, real places and
 * offerings) → VERIFY (feasibility; live facts for finalists) → SOLVE
 * (timeline, money, diversity) → explain. Gemini is not involved here: it
 * only interprets language upstream.
 */
@Injectable()
export class PlanningEngineService {
  private readonly logger = new Logger(PlanningEngineService.name);

  constructor(
    private readonly retrieval: CandidateRetrievalService,
    private readonly verification: LiveVerificationService,
    private readonly personalSignals: PersonalSignalsService,
    @Optional() private readonly knowledge?: KnowledgeSignalsService,
  ) {}

  async plan(input: EngineInput): Promise<EngineResult> {
    const startedAt = Date.now();
    let verificationMs = 0;
    let solvingMs = 0;
    const measuredSolve = (value: Parameters<typeof solve>[0]) => {
      const start = Date.now();
      const result = solve(value);
      solvingMs += Date.now() - start;
      return result;
    };
    let intent = scheduleIntent(input.intent, input.requestedAt);
    let shape = buildPlanShape(intent, input.requestedAt);
    // A refinement keeps the base plan's structure: same slots (minus the
    // removed one), so pinned stops land where they were.
    const refinement = input.refinement;
    if (refinement?.shape.length) {
      shape = {
        slots: refinement.shape
          .filter((slot) => slot.id !== refinement.removedSlotId)
          .filter((slot) => slot.experiences.every(isExperienceKey))
          .map((slot) => ({
            id: slot.id,
            role: slot.role as PlanShape['slots'][number]['role'],
            experiences: slot.experiences as ExperienceKey[],
            required: slot.role === 'ANCHOR',
          })),
        anchorPreferredStart:
          refinement.anchorStart ?? shape.anchorPreferredStart,
      };
      input = {
        ...input,
        pinnedKeys: new Map(
          refinement.pinned
            .filter((pin) => pin.slotId !== refinement.removedSlotId)
            .map((pin) => [pin.slotId, pin.key]),
        ),
        excludedPlaceIds: new Set(refinement.excludedPlaceIds),
      };
    }
    const excludedKeys = new Set(refinement?.excludedKeys ?? []);
    // Wineries and adventure are outside the city: unless the person limited
    // the travel, the plan may go there.
    const anchorKeys = shape.slots
      .filter((slot) => slot.role === 'ANCHOR')
      .flatMap((slot) => slot.experiences);
    if (
      intent.location.radiusKm === null &&
      intent.location.travelTolerance === 'medium' &&
      anchorKeys.some((key) => key === 'wine' || key === 'adventure')
    ) {
      intent = {
        ...intent,
        location: { ...intent.location, travelTolerance: 'high' },
      };
    }
    const experiences = [
      ...new Set(shape.slots.flatMap((slot) => slot.experiences)),
    ];
    const retrievalStartedAt = Date.now();
    const [retrievalResult, personal] = await Promise.all([
      this.retrieval.retrieve(
        intent,
        experiences,
        input.rawQuery,
        input.requestedAt,
        false,
        !input.offline,
      ),
      input.idUser !== null
        ? this.personalSignals.load(input.idUser, input.requestedAt)
        : Promise.resolve(EMPTY_PERSONAL_SIGNALS),
    ]);
    let retrieved = retrievalResult;

    // A named zone with too little to plan the main experience: say so and
    // widen to nearby places instead of answering from nowhere.
    let zoneFallback = false;
    if (
      retrieved.area?.idDepartments?.length === 1 &&
      !intent.location.region
    ) {
      const anchorKey = anchorKeys[0];
      const zoneMonth = Number(intent.when.date.slice(5, 7));
      // Distinct venues: four experiences of one winery are one option.
      const inZone = anchorKey
        ? new Set(
            retrieved.candidates
              .filter(
                (candidate) =>
                  EXPERIENCES[anchorKey].actions.includes(candidate.action) &&
                  !candidate.connective &&
                  staticFeasibility(candidate, intent, zoneMonth).verdict !==
                    'INFEASIBLE',
              )
              .map((candidate) => candidate.placeId),
          ).size
        : 0;
      if (anchorKey && inZone < 2) {
        retrieved = await this.retrieval.retrieve(
          intent,
          experiences,
          input.rawQuery,
          input.requestedAt,
          true,
          !input.offline,
        );
        zoneFallback = true;
      }
    }

    const retrievalMs = Date.now() - retrievalStartedAt;
    // Experiences nothing in the catalog can satisfy (a cinema with no
    // screenings) are dropped from the shape and reported, never faked.
    const satisfiable = (key: ExperienceKey) =>
      retrieved.candidates.some((candidate) =>
        EXPERIENCES[key].actions.includes(candidate.action),
      );
    const unsupportedExperiences = intent.experiences
      .filter(({ key, required }) => required && !satisfiable(key))
      .map(({ key }) => key);
    shape = {
      ...shape,
      slots: shape.slots
        .map((slot) => ({
          ...slot,
          experiences: slot.experiences.filter(satisfiable),
        }))
        .filter(
          (slot) =>
            slot.experiences.length > 0 &&
            (unsupportedExperiences.length === 0 || slot.required),
        ),
    };
    if (
      !shape.slots.some((slot) => slot.role === 'ANCHOR') &&
      shape.slots.length
    ) {
      shape.slots[0] = { ...shape.slots[0], role: 'ANCHOR', required: true };
    }
    // When the first anchor changed (cinema dropped), start at the moment
    // of the new one (dinner at 21:00, not the cinema's 19:00).
    const firstAnchor = shape.slots.find((slot) => slot.role === 'ANCHOR');
    if (
      firstAnchor &&
      firstAnchor.experiences[0] !== anchorKeys[0] &&
      intent.when.startMinutes === null &&
      !intent.when.now
    ) {
      shape = {
        ...shape,
        anchorPreferredStart: preferredStartOf(firstAnchor.experiences[0]),
      };
    }

    const month = Number(intent.when.date.slice(5, 7));
    const staticRejected: Record<string, number> = {};
    const rejectedPlaces = new Map<string, Set<number>>();
    const assessed = new Map<string, Feasibility>();
    let feasible = 0;
    let uncertain = 0;
    for (const candidate of retrieved.candidates) {
      const result = staticFeasibility(candidate, intent, month);
      assessed.set(candidate.key, result);
      if (result.verdict === 'INFEASIBLE') {
        for (const reason of result.reasons) {
          staticRejected[reason] = (staticRejected[reason] ?? 0) + 1;
          const places = rejectedPlaces.get(reason) ?? new Set<number>();
          places.add(candidate.placeId);
          rejectedPlaces.set(reason, places);
        }
      } else if (result.verdict === 'FEASIBLE') feasible += 1;
      else uncertain += 1;
    }

    let candidates = retrieved.candidates;
    let ranked = this.rankSlots(shape, candidates, assessed, intent, personal);

    let verification: EngineTrace['verification'] = {
      locations: 0,
      hours: 0,
      prices: 0,
      skipped: null,
    };
    const verifiedPlaces = new Set<number>();
    const absorb = (outcome: VerificationOutcome) => {
      verification = {
        locations: verification.locations + outcome.locationsVerified,
        hours: verification.hours + outcome.hoursVerified,
        prices: verification.prices + outcome.pricesVerified,
        skipped: outcome.skipped ?? verification.skipped,
      };
      // Every live lookup is a fact we should know durably next time.
      for (const need of outcome.enrichmentNeeded)
        void this.knowledge?.request(
          need.placeId,
          need.fact === 'HOURS'
            ? 'NEEDS_DURABLE_HOURS'
            : 'NEEDS_DURABLE_LOCATION',
          outcome.closed.includes(need.placeId) ? 2 : 4,
          outcome.closed.includes(need.placeId)
            ? { providerStatus: 'not_operational' }
            : null,
        );
      if (!outcome.updated.size) return false;
      candidates = candidates.map((candidate) => {
        const updated = outcome.updated.get(candidate.key);
        if (!updated) return candidate;
        const distanceKm = retrieved.area
          ? haversineKm(retrieved.area, updated)
          : null;
        const next = {
          ...updated,
          distanceKm:
            distanceKm === null ? null : Math.round(distanceKm * 100) / 100,
        };
        assessed.set(next.key, staticFeasibility(next, intent, month));
        return next;
      });
      ranked = this.rankSlots(shape, candidates, assessed, intent, personal);
      return true;
    };

    // ENRICH: the strongest candidates SmartPlan cannot yet stand behind
    // (unknown hours or price) are verified live before solving, only when
    // they would beat the best option that is already decision-grade.
    if (!input.offline) {
      const serious = this.seriousUnresolved(
        shape,
        ranked,
        intent,
        this.verification.perRequestBudget(),
      );
      if (serious.length) {
        const verificationStartedAt = Date.now();
        const outcome = await this.verification.verify(
          serious.map((candidate) => ({ candidate, needsHours: true })),
          input.requestedAt,
        );
        verificationMs += Date.now() - verificationStartedAt;
        for (const candidate of serious) verifiedPlaces.add(candidate.placeId);
        absorb(outcome);
      }
    }

    let solved = measuredSolve({
      intent,
      shape,
      candidatesBySlot: ranked,
      pinned: this.pinned(
        input.pinnedKeys,
        ranked,
        candidates,
        assessed,
        intent,
        personal,
        shape,
      ),
      excludedPlaceIds: input.excludedPlaceIds,
      excludedKeys,
    });

    // VERIFY: live facts only for serious finalists whose feasibility or
    // placement depends on them; then re-solve with what was learned.
    // At most two rounds: the plan we recommend, and (only if what we learned
    // changed it) the stops of the new best plan, within 3 hours checks.
    for (let round = 0; round < 2 && !input.offline; round += 1) {
      const finalists = this.finalists(
        solved.proposals,
        ranked,
        shape,
        intent,
        verifiedPlaces,
        // The plan we are about to recommend gets its own last mile: up to
        // BEST_PLAN_EXTRA_CHECKS more for its still-unresolved stops.
        Math.max(
          0,
          this.verification.perRequestBudget() - verifiedPlaces.size,
        ) + BEST_PLAN_EXTRA_CHECKS,
      );
      if (!finalists.length) break;
      const verificationStartedAt = Date.now();
      const outcome = await this.verification.verify(
        finalists,
        input.requestedAt,
      );
      verificationMs += Date.now() - verificationStartedAt;
      for (const finalist of finalists)
        verifiedPlaces.add(finalist.candidate.placeId);
      const bestBefore = solved.proposals[0]?.stops
        .map((stop) => stop.ranked.candidate.key)
        .join('|');
      if (!absorb(outcome)) break;
      solved = measuredSolve({
        intent,
        shape,
        candidatesBySlot: ranked,
        pinned: this.pinned(
          input.pinnedKeys,
          ranked,
          candidates,
          assessed,
          intent,
          personal,
          shape,
        ),
        excludedPlaceIds: input.excludedPlaceIds,
        excludedKeys,
      });
      const bestAfter = solved.proposals[0]?.stops
        .map((stop) => stop.ranked.candidate.key)
        .join('|');
      if (bestAfter === bestBefore) break;
    }
    if (verification.hours || verification.locations || verification.prices) {
      feasible = 0;
      uncertain = 0;
      for (const result of assessed.values()) {
        if (result.verdict === 'FEASIBLE') feasible += 1;
        else if (result.verdict === 'UNCERTAIN') uncertain += 1;
      }
    }

    const narrations = narrate(solved.proposals, intent, input.requestedAt);
    const strictUnproven =
      intent.budget?.strict &&
      !solved.proposals.some((proposal) => proposal.budgetStatus === 'WITHIN');
    const diagnostics =
      !solved.proposals.length || strictUnproven
        ? this.diagnose(
            intent,
            shape,
            candidates.filter(
              (candidate) =>
                !input.excludedPlaceIds?.has(candidate.placeId) &&
                !excludedKeys.has(candidate.key),
            ),
            unsupportedExperiences,
            solved.timedRejections,
          )
        : undefined;
    // A strict budget far below anything we know the requested experience
    // costs is answered with the truth and the nearest real number, not
    // with plans whose prices we simply do not know.
    if (
      diagnostics?.reason === 'BUDGET' &&
      intent.budget &&
      diagnostics.cheapestKnownTotal !== null &&
      diagnostics.cheapestKnownTotal >= intent.budget.amount * 2
    ) {
      solved = { ...solved, proposals: [] };
      narrations.length = 0;
    }
    if (zoneFallback)
      for (const narration of narrations)
        narration.uncertainties.unshift(
          'En la zona que pediste encontramos pocas opciones con datos suficientes: sumamos lugares cercanos',
        );
    const anchorFunnel = this.anchorFunnel(
      shape,
      candidates,
      assessed,
      intent,
      input.requestedAt,
    );
    const trace: EngineTrace = {
      rankingVersion: RANKING_VERSION,
      intentVersion: intent.version,
      shape: shape.slots.map((slot) => ({
        id: slot.id,
        role: slot.role,
        experiences: slot.experiences,
      })),
      unsupportedExperiences,
      ...(zoneFallback ? { zoneFallback } : {}),
      ...(diagnostics ? { diagnostics } : {}),
      area: retrieved.area,
      universePlaces: retrieved.universe,
      candidates: retrieved.candidates.length,
      staticRejected,
      feasible,
      uncertain,
      anchorFunnel,
      discarded: {
        overBudget: rejectedPlaces.get('over_budget')?.size ?? 0,
        tooFar: rejectedPlaces.get('too_far')?.size ?? 0,
        closedForGood: rejectedPlaces.get('closed_permanently')?.size ?? 0,
        closedAtTime: anchorFunnel
          ? Math.max(0, anchorFunnel.feasible - anchorFunnel.openAtTime)
          : 0,
      },
      shortlist: Object.fromEntries(
        [...ranked.entries()].map(([slot, list]) => [slot, list.length]),
      ),
      combinationsEvaluated: solved.combinationsEvaluated,
      timedRejections: solved.timedRejections,
      verification,
      ...(retrieved.live ? { live: retrieved.live } : {}),
      bestDecisionGrade: solved.proposals[0]?.decisionGrade ?? false,
      proposals: solved.proposals.length,
      durationMs: Date.now() - startedAt,
      timings: { retrievalMs, verificationMs, solvingMs },
    };
    this.logger.log({
      event: 'planning_engine_completed',
      candidates: trace.candidates,
      proposals: trace.proposals,
      durationMs: trace.durationMs,
    });
    return {
      intent,
      proposals: solved.proposals,
      narrations,
      shape,
      trace,
      ranked,
    };
  }

  private rankSlots(
    shape: PlanShape,
    candidates: PlanCandidate[],
    assessed: Map<string, Feasibility>,
    intent: PlanIntent,
    personal: PersonalSignals,
  ): Map<string, RankedCandidate[]> {
    const maxText = Math.max(0, ...candidates.map((c) => c.textScore));
    const weekday = weekdayOf(intent.when.date);
    const result = new Map<string, RankedCandidate[]>();
    for (const slot of shape.slots) {
      const list: RankedCandidate[] = [];
      for (const candidate of candidates) {
        const feasibility = assessed.get(candidate.key);
        if (!feasibility || feasibility.verdict === 'INFEASIBLE') continue;
        const rankedCandidate = rankCandidate(
          candidate,
          feasibility,
          slot.experiences,
          intent,
          personal,
          maxText,
        );
        if (rankedCandidate) list.push(rankedCandidate);
      }
      // Near-ties are broken by a small per-request rotation, so venues
      // that nothing distinguishes (same kind, no evidence yet) take turns
      // instead of the same one winning every request.
      const seed = `${intent.when.date}|${intent.occasion ?? ''}|${shape.slots
        .map((s) => s.experiences.join('+'))
        .join('/')}`;
      const rotation = rotationSpan(list.map(({ candidate }) => candidate));
      for (const r of list) {
        // A screening near the natural time of the slot fits better than one
        // at 14:30 (up to +0.06, fading over three hours).
        const fixed = r.candidate.fixedStart;
        const timeFit =
          fixed === undefined
            ? 0
            : 0.06 *
              (1 -
                Math.min(
                  1,
                  Math.abs(fixed - shape.anchorPreferredStart) / 180,
                ));
        // Rotation must not erase the advantage of a documented alternative.
        // A wholly unknown pool can still rotate broadly across requests.
        const c = r.candidate;
        const gradeStart = fixed ?? shape.anchorPreferredStart;
        const ungraded = !isDecisionGrade(c, weekday, gradeStart);
        r.score =
          Math.round(
            (r.score -
              (ungraded ? NOT_DECISION_GRADE_PENALTY : 0) +
              timeFit +
              tieBreak(seed, c.placeId, rotation)) *
              10000,
          ) / 10000;
      }
      list.sort(
        (a, b) =>
          b.score - a.score || a.candidate.key.localeCompare(b.candidate.key),
      );
      result.set(slot.id, list.slice(0, SLOT_SHORTLIST));
    }
    return result;
  }

  /**
   * Pinned stops of a refinement, ranked for their slot even when they fell
   * outside the shortlist (a kept stop is never silently dropped).
   */
  private pinned(
    pinnedKeys: Map<string, string> | undefined,
    ranked: Map<string, RankedCandidate[]>,
    candidates: PlanCandidate[],
    assessed: Map<string, Feasibility>,
    intent: PlanIntent,
    personal: PersonalSignals,
    shape: PlanShape,
  ): Map<string, RankedCandidate> | undefined {
    if (!pinnedKeys?.size) return undefined;
    const pinned = new Map<string, RankedCandidate>();
    for (const [slotId, key] of pinnedKeys) {
      let match = ranked.get(slotId)?.find((r) => r.candidate.key === key);
      if (!match) {
        const candidate = candidates.find((c) => c.key === key);
        const slot = shape.slots.find((s) => s.id === slotId);
        const feasibility = candidate && assessed.get(candidate.key);
        if (
          candidate &&
          slot &&
          feasibility &&
          feasibility.verdict !== 'INFEASIBLE'
        )
          match =
            rankCandidate(
              candidate,
              feasibility,
              slot.experiences,
              intent,
              personal,
              1,
            ) ?? undefined;
      }
      if (match) pinned.set(slotId, match);
    }
    return pinned;
  }

  /**
   * Candidates worth a live check before solving: per slot (anchor first),
   * those that would rank above the best decision-grade option if their
   * unknown hours/price were confirmed, and that Google can verify. At most
   * two per slot and `budget` in total.
   */
  private seriousUnresolved(
    shape: PlanShape,
    ranked: Map<string, RankedCandidate[]>,
    intent: PlanIntent,
    budget: number,
  ): PlanCandidate[] {
    const weekday = weekdayOf(intent.when.date);
    const picked: PlanCandidate[] = [];
    const places = new Set<number>();
    // Required slots first (the plan cannot exist without them), the anchor
    // first among them; optional extras only with what is left.
    const slots = [...shape.slots].sort(
      (a, b) =>
        Number(b.required) - Number(a.required) ||
        Number(b.role === 'ANCHOR') - Number(a.role === 'ANCHOR'),
    );
    const requiredCount = slots.filter((slot) => slot.required).length;
    for (const slot of slots) {
      const raw = (ranked.get(slot.id) ?? [])
        .slice(0, 12)
        .map((r) => {
          const start = r.candidate.fixedStart ?? shape.anchorPreferredStart;
          const graded = isDecisionGrade(r.candidate, weekday, start);
          return {
            r,
            graded,
            raw: r.score + (graded ? 0 : NOT_DECISION_GRADE_PENALTY),
          };
        })
        .sort((a, b) => b.raw - a.raw);
      let inSlot = 0;
      for (const entry of raw) {
        if (entry.graded) break;
        const candidate = entry.r.candidate;
        if (!candidate.googlePlaceId || places.has(candidate.placeId)) continue;
        if (candidate.closedPermanently) continue;
        picked.push(candidate);
        places.add(candidate.placeId);
        inSlot += 1;
        // A lone required slot may use most of the budget (its runners-up
        // become the alternatives); shared budgets split evenly.
        const perSlot = slot.required
          ? Math.max(1, Math.ceil(budget / Math.max(1, requiredCount)))
          : 1;
        if (inSlot >= perSlot || picked.length >= budget) break;
      }
      if (picked.length >= budget) break;
    }
    return picked;
  }

  /**
   * The last mile: hours only for stops of the plan we recommend first whose
   * hours we do not know for that day (an unresolved doubt that can change
   * the decision); positions for unlocated stops of the shown plans and the
   * strongest unlocated anchors. Never a sweep.
   */
  private finalists(
    proposals: PlanProposal[],
    ranked: Map<string, RankedCandidate[]>,
    shape: PlanShape,
    intent: PlanIntent,
    alreadyVerified: Set<number>,
    hoursBudget: number,
  ): { candidate: PlanCandidate; needsHours: boolean }[] {
    const chosen: { candidate: PlanCandidate; needsHours: boolean }[] = [];
    const places = new Set<number>();
    let hoursLeft = Math.max(0, hoursBudget);
    const weekday = weekdayOf(intent.when.date);
    const add = (candidate: PlanCandidate, needsHours: boolean) => {
      if (alreadyVerified.has(candidate.placeId)) return;
      if (places.size >= FINALIST_PLACES && !places.has(candidate.placeId))
        return;
      const hours = needsHours && hoursLeft > 0;
      if (hours) hoursLeft -= 1;
      if (!hours && candidate.location !== 'APPROXIMATE') return;
      places.add(candidate.placeId);
      chosen.push({ candidate, needsHours: hours });
    };
    proposals.forEach((proposal, index) => {
      for (const stop of proposal.stops) {
        const candidate = stop.ranked.candidate;
        const unknownHours =
          !candidate.hours ||
          !hoursKnownFor(candidate.hours, weekday, stop.start);
        add(candidate, index === 0 && unknownHours);
      }
    });
    const anchorSlot = shape.slots.find((slot) => slot.role === 'ANCHOR');
    for (const rankedCandidate of (anchorSlot && ranked.get(anchorSlot.id)) ??
      [])
      if (rankedCandidate.candidate.location === 'APPROXIMATE')
        add(rankedCandidate.candidate, false);
    return chosen;
  }

  private diagnose(
    intent: PlanIntent,
    shape: PlanShape,
    candidates: PlanCandidate[],
    unsupported: ExperienceKey[],
    timedRejections: Record<string, number>,
  ): PlanDiagnostics {
    const people = partySize(intent);
    // A useful reference may exceed the budget, but must still satisfy the
    // person's group, season, geography and explicit exclusions.
    const withoutBudget = { ...intent, budget: null };
    const month = Number(intent.when.date.slice(5, 7));
    const anchors = shape.slots.filter((slot) => slot.role === 'ANCHOR');
    const compatible = candidates.filter(
      (candidate) =>
        staticFeasibility(candidate, withoutBudget, month).verdict !==
          'INFEASIBLE' &&
        anchors.some(
          (slot) => satisfiedExperience(candidate, slot.experiences) !== null,
        ),
    );
    let cheapest: number | null = 0;
    for (const slot of anchors) {
      const costs = compatible
        .filter(
          (candidate) =>
            satisfiedExperience(candidate, slot.experiences) !== null,
        )
        .map((c) => candidateCostMin(c, people))
        .filter((cost): cost is number => cost !== null && cost > 0);
      if (!costs.length) {
        cheapest = null;
        break;
      }
      if (cheapest !== null) cheapest += Math.min(...costs);
    }
    const closedAtTime =
      (timedRejections.closed_at_arrival ?? 0) +
      (timedRejections.closes_during_stop ?? 0) +
      (timedRejections.outside_typical_hours ?? 0);
    const reason: PlanDiagnostics['reason'] = unsupported.length
      ? 'UNSUPPORTED'
      : intent.budget &&
          (compatible.some((candidate) =>
            staticFeasibility(candidate, intent, month).reasons.includes(
              'over_budget',
            ),
          ) ||
            (cheapest !== null && cheapest > intent.budget.amount))
        ? 'BUDGET'
        : closedAtTime > 0
          ? 'NOTHING_OPEN'
          : compatible.length
            ? null
            : 'NO_CANDIDATES';
    return {
      reason,
      cheapestKnownTotal: cheapest ? Math.round(cheapest) : null,
      unsupported,
      closedAtTime,
    };
  }

  /** Real funnel of the first anchor at the time it would happen. */
  private anchorFunnel(
    shape: PlanShape,
    candidates: PlanCandidate[],
    assessed: Map<string, Feasibility>,
    intent: PlanIntent,
    requestedAt: Date,
  ): EngineTrace['anchorFunnel'] {
    const anchor = shape.slots.find((slot) => slot.role === 'ANCHOR');
    if (!anchor) return null;
    const experience = anchor.experiences[0];
    const matching = candidates.filter((candidate) =>
      EXPERIENCES[experience].actions.includes(candidate.action),
    );
    const feasibleNow = matching.filter(
      (candidate) => assessed.get(candidate.key)?.verdict !== 'INFEASIBLE',
    );
    const weekday = weekdayOf(intent.when.date);
    const start = shape.anchorPreferredStart;
    const open = feasibleNow.filter(
      (candidate) =>
        combine(
          assessed.get(candidate.key)!,
          timedFeasibility(
            candidate,
            weekday,
            start,
            start + candidate.durationMinutes,
          ),
        ).verdict !== 'INFEASIBLE',
    );
    const people = partySize(intent);
    const places = (list: PlanCandidate[]) =>
      new Set(list.map((candidate) => candidate.placeId)).size;
    // The character asked for (style, energy, social register), judged only
    // by evidence a venue itself carries, never by the kind's prior.
    const characterFacets = (intent.facets ?? []).filter(
      (facet) =>
        facet.polarity === 'want' &&
        ['style', 'energy', 'social'].includes(facet.dimension),
    );
    const characterTraits = new Set(effectsOf(characterFacets).vibe);
    const fitsCharacter = characterTraits.size
      ? places(
          open.filter((candidate) =>
            candidate.traits.some(
              (evidence) =>
                characterTraits.has(evidence.trait) &&
                evidence.source !== 'PRIOR' &&
                evidence.score > 0.3,
            ),
          ),
        )
      : 0;
    const chips = understandingOf(intent, requestedAt).chips.filter(
      (chip) => chip.key === 'facet' && chip.polarity !== 'avoid',
    );
    return {
      experience,
      withPrice: places(
        open.filter(
          (candidate) =>
            candidate.price.priceKind !== 'UNKNOWN' &&
            priceConfidence(candidate.price) !== 'NONE',
        ),
      ),
      fitsCharacter,
      character: characterTraits.size && chips.length ? chips[0].label : null,
      places: places(matching),
      feasible: places(feasibleNow),
      openAtTime: places(open),
      confirmedOpenAtTime: places(
        open.filter(
          (candidate) =>
            timedFeasibility(
              candidate,
              weekday,
              start,
              start + candidate.durationMinutes,
            ).verdict === 'FEASIBLE',
        ),
      ),
      knownWithinBudget: intent.budget
        ? places(
            open.filter((candidate) => {
              const totals = computePlanTotals([candidate.price], people);
              return (
                totals.unpricedCount === 0 &&
                totals.totalMax !== null &&
                totals.totalMax <= intent.budget!.amount
              );
            }),
          )
        : null,
    };
  }
}
