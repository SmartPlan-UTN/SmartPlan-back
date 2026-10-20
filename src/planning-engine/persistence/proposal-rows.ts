/**
 * Turns a solved proposal into the rows a plan is stored as: the plan (with
 * its start time, totals and the explanation shown) and its stops (each with
 * the price snapshot, the planned time, the leg from the previous stop and
 * the basis of its estimate). Pure: callers own the transaction.
 */
import {
  computePlanTotals,
  snapshotValues,
  UNKNOWN_PRICE,
  type PriceFields,
} from '../../common/pricing/price';
import type { PlanCandidate } from '../candidate';
import type { Plan } from '../../plans/entities/plan.entity';
import { PlanKind } from '../../plans/entities/plan.entity';
import type { PlanDetail } from '../../plans/entities/plan-detail.entity';
import { EXPERIENCES } from '../intent/experiences';
import { partySize, type PlanIntent } from '../intent/plan-intent';
import { screeningLabel, type ProposalNarration } from '../narration/narration';
import { RANKING_VERSION } from '../ranking/ranking';
import type { PlanProposal } from '../solver/solver';
import { fromLocal } from '../time';

export interface ProposalRoute {
  distanceMeters: number;
  durationSeconds: number;
}

export interface ProposalRows {
  plan: Partial<Plan>;
  details: Partial<PlanDetail>[];
  placeIds: number[];
}

const round = (value: number) => Math.round(value * 10000) / 10000;

/** A price read live from Google for this request (provider content). */
export function isProviderPrice(price: PriceFields): boolean {
  return (
    price.priceSource === 'PROVIDER_HINT' &&
    (price.priceSourceRef?.startsWith('google:') ?? false)
  );
}

const liveHours = (candidate: PlanCandidate) =>
  candidate.hours?.source === 'LIVE_PROVIDER';

function hasProviderPrices(proposal: PlanProposal): boolean {
  return proposal.stops.some(({ ranked: { candidate } }) =>
    isProviderPrice(candidate.price),
  );
}

export function proposalRows(input: {
  proposal: PlanProposal;
  narration: ProposalNarration;
  intent: PlanIntent;
  idUser: number;
  idPlanRequest: number;
  idPlanStatus: number;
  route: ProposalRoute | null;
  now?: Date;
  /** Real counts of what the engine ruled out (shown with the best plan). */
  discarded?: Record<string, number>;
  /**
   * Keep Google's live values (price ranges, closing times) in the saved
   * plan. Off by default: Places content may not be stored; the plan keeps
   * SmartPlan's verdicts (open at that time, within budget) and the Place
   * ID, and Google's own UI shows Google's values.
   */
  persistProviderFacts?: boolean;
}): ProposalRows {
  const keepProvider = input.persistProviderFacts === true;
  const providerPriced = hasProviderPrices(input.proposal);
  const savedTotals =
    providerPriced && !keepProvider
      ? computePlanTotals(
          input.proposal.stops.map(({ ranked: { candidate } }) =>
            isProviderPrice(candidate.price) ? UNKNOWN_PRICE : candidate.price,
          ),
          partySize(input.intent),
        )
      : input.proposal.totals;
  const { proposal, narration, intent, route } = input;
  const located = proposal.stops.every(
    ({ ranked: { candidate } }) =>
      candidate.location !== 'APPROXIMATE' &&
      candidate.latitude !== null &&
      candidate.longitude !== null,
  );
  const now = input.now ?? new Date();
  const travelMeters = route
    ? route.distanceMeters
    : located
      ? Math.round(proposal.travelKm * 1000)
      : null;
  const travelSeconds = route
    ? route.durationSeconds
    : proposal.travelMinutes * 60;

  // Stop insights as saved: Google's live values become SmartPlan verdicts.
  const insights = proposal.stops.map(({ ranked: { candidate } }, index) => {
    const insight = narration.stops[index]?.insight;
    if (!insight || keepProvider) return insight ?? null;
    return {
      ...insight,
      ...(isProviderPrice(candidate.price)
        ? {
            price: null,
            priceSource: 'Precio publicado en Google Maps, verificado hoy',
            priceLive: true,
          }
        : {}),
      ...(liveHours(candidate)
        ? {
            hours: 'Abierto a esa hora',
            hoursSource: 'Verificado hoy en Google Maps',
          }
        : {}),
    };
  });

  const plan: Partial<Plan> = {
    title: narration.title.slice(0, 150),
    description: narration.why || null,
    idUser: input.idUser,
    // A result of the request, private to the requester (#98).
    kind: PlanKind.Generated,
    idPlanRequest: input.idPlanRequest,
    idPlanStatus: input.idPlanStatus,
    peopleCount: partySize(intent),
    // Free stops plus unpriced ones are not a $0 plan: no total is shown.
    estimatedTotalCost:
      savedTotals.unpricedCount > 0 && !savedTotals.totalMin
        ? null
        : savedTotals.totalMin,
    estimatedTotalCostMax: savedTotals.totalMax,
    unpricedCount: savedTotals.unpricedCount,
    priceCompleteness: savedTotals.completeness,
    estimatedTotalDuration: Math.max(0, proposal.end - proposal.start),
    travelDistanceMeters: proposal.stops.length > 1 ? travelMeters : null,
    travelDurationSeconds: proposal.stops.length > 1 ? travelSeconds : null,
    startsAt: fromLocal(intent.when.date, proposal.start),
    rankingMeta: {
      role: proposal.role,
      roleLabel: narration.roleLabel,
      why: narration.why,
      tagline: narration.tagline,
      echo: narration.echo,
      difference: narration.difference,
      uncertainties: narration.uncertainties,
      missingExperiences: narration.missingExperiences,
      budgetStatus: proposal.budgetStatus,
      travelMinutes: route
        ? Math.ceil(route.durationSeconds / 60)
        : proposal.travelMinutes,
      travelKm: route
        ? Math.round(route.distanceMeters / 100) / 10
        : located
          ? proposal.travelKm
          : null,
      travelSource: route ? 'route' : 'estimate',
      stops: narration.stops.map((stop, index) => ({
        label: stop.label,
        evidence: stop.evidence,
        caveats: stop.caveats,
        ...(insights[index] ? { insight: insights[index] } : {}),
      })),
      decisionGrade: proposal.decisionGrade ?? false,
      // Prices of some stops were read live from Google Maps: the saved
      // plan keeps the verdict (budgetStatus), not Google's numbers.
      ...(providerPriced && !keepProvider
        ? { priceBasis: 'PROVIDER_LIVE', priceCheckedAt: now.toISOString() }
        : {}),
      ...(proposal.role === 'BEST' && input.discarded
        ? { discarded: input.discarded }
        : {}),
      rankingVersion: RANKING_VERSION,
      intentVersion: intent.version,
      score: proposal.score,
      components: proposal.stops.map((stop) => ({
        key: stop.ranked.candidate.key,
        score: stop.ranked.score,
        ...Object.fromEntries(
          (Object.entries(stop.ranked.components) as [string, number][]).map(
            ([name, value]) => [name, round(value)],
          ),
        ),
      })),
    },
  };

  const details: Partial<PlanDetail>[] = proposal.stops.map((stop, index) => {
    const candidate = stop.ranked.candidate;
    const narrationStop = narration.stops[index];
    return {
      idActivity: candidate.kind === 'OFFERING' ? candidate.activityId : null,
      idPlace: candidate.placeId,
      action: candidate.kind === 'OFFERING' ? null : candidate.action,
      order: index + 1,
      // Immutable snapshot of what the planner showed.
      ...snapshotValues(
        isProviderPrice(candidate.price) && !keepProvider
          ? UNKNOWN_PRICE
          : candidate.price,
        now,
      ),
      estimatedDuration: candidate.durationMinutes,
      startMinute: stop.start,
      legTravelMinutes: index === 0 ? null : stop.travelMinutesFromPrevious,
      legDistanceMeters:
        index === 0 ||
        candidate.location === 'APPROXIMATE' ||
        proposal.stops[index - 1].ranked.candidate.location === 'APPROXIMATE'
          ? null
          : Math.round(stop.legKmFromPrevious * 1000),
      estimateBasis: {
        ...(candidate.bookingUrl
          ? { reservationUrl: candidate.bookingUrl }
          : {}),
        ...(candidate.mealBasket ? { mealBasket: candidate.mealBasket } : {}),
        // An immutable snapshot of the screening (dynamic inventory).
        ...(candidate.screening
          ? {
              screening: candidate.screening,
              stopLabel: screeningLabel(candidate),
            }
          : {}),
        experience: stop.experience,
        experienceLabel: EXPERIENCES[stop.experience].label,
        slotId: stop.slotId,
        slotRole: stop.slotRole,
        evidence: narrationStop?.evidence ?? [],
        ...(insights[index] ? { insight: insights[index] } : {}),
        ...(candidate.googlePlaceId &&
        (isProviderPrice(candidate.price) || liveHours(candidate))
          ? {
              googlePlaceId: candidate.googlePlaceId,
              liveCheckedAt: now.toISOString(),
            }
          : {}),
        caveats: narrationStop?.caveats ?? [],
        uncertain: [
          ...stop.feasibility.reasons.filter((reason) =>
            [
              'hours_unknown',
              'price_unknown',
              'location_approximate',
              'moment_unconfirmed',
            ].includes(reason),
          ),
          ...(stop.slotRole === 'ANCHOR' && proposal.contextGrade === false
            ? ['context_unconfirmed']
            : []),
        ],
        location: candidate.location,
      },
      note: null,
    };
  });

  return {
    plan,
    details,
    placeIds: [
      ...new Set(proposal.stops.map((stop) => stop.ranked.candidate.placeId)),
    ],
  };
}
