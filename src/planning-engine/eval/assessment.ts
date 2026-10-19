/**
 * Evaluation V2: product truth, independent of whether the solver returned
 * valid rows. A plan is FULL only when every explicitly requested
 * experience is really satisfied (by evidence, not by a label), every stop's
 * hours are confirmed for that time, and a stated budget is proven to fit.
 *
 * Classification (worst wins across a scenario's options):
 * - FAILED: something is wrong (a closed/impossible stop, a false budget
 *   claim, unknown shown as free, an impossible timeline, absurd travel).
 * - PARTIAL: a requested experience is missing (or cannot be planned).
 * - UNCERTAIN: everything requested is present, but some hours, prices or
 *   services are not confirmed.
 * - FULL: verified.
 */
import type { PlanIntent } from '../intent/plan-intent';
import { EXPERIENCES, type ExperienceKey } from '../intent/experiences';
import type { PlannedStop, PlanProposal } from '../solver/solver';
import { hoursKnownFor } from '../candidate';
import { weekdayOf } from '../time';
import { hasUnconfirmedContext } from '../traits/context-evidence';

export type Satisfaction = 'FULL' | 'PARTIAL' | 'UNCERTAIN' | 'FAILED';
export type ComponentState = 'SATISFIED' | 'UNCONFIRMED' | 'MISSING';

export interface ProposalAssessment {
  satisfaction: Satisfaction;
  components: Partial<Record<ExperienceKey, ComponentState>>;
  missingExperiences: ExperienceKey[];
  verifiedBudgetFit: boolean | null;
  hours: { confirmed: number; unconfirmed: number };
  uncertainties: string[];
  failures: string[];
}

/** Public open spaces are accessible by nature in daytime (no hours to verify). */
const OPEN_SPACE = new Set(['plaza', 'park', 'viewpoint', 'memorial']);

function hoursConfirmed(stop: PlannedStop, weekday: number): boolean {
  const candidate = stop.ranked.candidate;
  if (candidate.kind === 'SCREENING') return true;
  if (
    candidate.placeKind &&
    OPEN_SPACE.has(candidate.placeKind) &&
    stop.start % 1440 >= 8 * 60 &&
    stop.end % 1440 <= 20 * 60
  )
    return true;
  return (
    candidate.hours !== null &&
    hoursKnownFor(candidate.hours, weekday, stop.start) &&
    !stop.feasibility.reasons.includes('hours_unknown')
  );
}

/** Is this stop really the requested experience, by its evidence? */
function componentOf(stop: PlannedStop, key: ExperienceKey): ComponentState {
  const candidate = stop.ranked.candidate;
  const experience = EXPERIENCES[key];
  if (!experience.actions.includes(candidate.action)) return 'MISSING';
  if (key === 'movie')
    return candidate.kind === 'SCREENING' ? 'SATISFIED' : 'MISSING';
  if (stop.feasibility.reasons.includes('moment_unconfirmed'))
    return 'UNCONFIRMED';
  if (experience.moment) {
    const moments = candidate.moments;
    if (
      candidate.kind === 'OFFERING' &&
      (!moments || !moments.includes(experience.moment))
    )
      return 'MISSING';
    if (moments && !moments.includes(experience.moment)) return 'MISSING';
  }
  return 'SATISFIED';
}

export function assessProposal(
  intent: PlanIntent,
  proposal: PlanProposal,
  requires: ExperienceKey[] = intent.experiences
    .filter(({ required }) => required)
    .map(({ key }) => key),
): ProposalAssessment {
  const weekday = weekdayOf(intent.when.date);
  const components: Partial<Record<ExperienceKey, ComponentState>> = {};
  for (const key of requires) {
    const states = proposal.stops
      .filter(
        (stop) =>
          stop.experience === key ||
          EXPERIENCES[key].actions.includes(stop.ranked.candidate.action),
      )
      .map((stop) => componentOf(stop, key));
    components[key] = states.includes('SATISFIED')
      ? 'SATISFIED'
      : states.includes('UNCONFIRMED')
        ? 'UNCONFIRMED'
        : 'MISSING';
  }
  const missingExperiences = (
    Object.keys(components) as ExperienceKey[]
  ).filter((key) => components[key] === 'MISSING');

  const failures: string[] = [];
  const uncertainties = new Set<string>();
  if (!proposal.stops.length) failures.push('empty_plan');
  let confirmed = 0;
  let unconfirmed = 0;
  proposal.stops.forEach((stop, index) => {
    const name = stop.ranked.candidate.placeName;
    if (stop.feasibility.verdict === 'INFEASIBLE')
      failures.push(`infeasible_stop:${name}`);
    if (hoursConfirmed(stop, weekday)) confirmed += 1;
    else {
      unconfirmed += 1;
      uncertainties.add('hours_unconfirmed');
    }
    for (const reason of stop.feasibility.reasons)
      if (
        [
          'price_unknown',
          'location_approximate',
          'moment_unconfirmed',
        ].includes(reason)
      )
        uncertainties.add(reason);
    if (index > 0) {
      const previous = proposal.stops[index - 1];
      // A timeline that does not fit travel is not executable.
      if (stop.start < previous.end + stop.travelMinutesFromPrevious)
        failures.push(`impossible_timeline:${name}`);
      const idle = stop.start - previous.end - stop.travelMinutesFromPrevious;
      if (idle > 60) failures.push(`idle_gap:${idle}min`);
      const legLimit =
        intent.location.travelTolerance === 'high'
          ? 150
          : intent.location.travelTolerance === 'low'
            ? 15
            : 35;
      if (stop.travelMinutesFromPrevious > legLimit)
        failures.push(`excessive_leg:${stop.travelMinutesFromPrevious}min`);
    }
  });
  if (
    intent.durationMinutes !== null &&
    proposal.end - proposal.start > intent.durationMinutes
  )
    failures.push('duration_violation');

  // Money is a promise.
  const totals = proposal.totals;
  const provenFit = intent.budget
    ? totals.unpricedCount === 0 &&
      totals.totalMax !== null &&
      totals.totalMax <= intent.budget.amount
    : null;
  if (proposal.budgetStatus === 'WITHIN' && !provenFit)
    failures.push('false_budget_fit');
  if (
    intent.budget?.strict &&
    totals.totalMin !== null &&
    totals.totalMin > intent.budget.amount
  )
    failures.push('budget_violation');
  if (totals.unpricedCount > 0 && totals.completeness === 'EXACT')
    failures.push('unknown_as_free');
  if (intent.budget && !provenFit) uncertainties.add('budget_unconfirmed');

  // Operational feasibility alone cannot prove an explicitly requested
  // atmosphere. Type priors and name guesses are not contextual evidence.
  if (
    hasUnconfirmedContext(
      intent,
      proposal.stops.map((stop) => stop.ranked.candidate),
    )
  )
    uncertainties.add('context_unconfirmed');
  const satisfaction: Satisfaction = failures.length
    ? 'FAILED'
    : missingExperiences.length
      ? 'PARTIAL'
      : uncertainties.size || Object.values(components).includes('UNCONFIRMED')
        ? 'UNCERTAIN'
        : 'FULL';
  return {
    satisfaction,
    components,
    missingExperiences,
    verifiedBudgetFit: provenFit,
    hours: { confirmed, unconfirmed },
    uncertainties: [...uncertainties],
    failures,
  };
}

/**
 * A scenario is judged by its BEST plan (what we recommend), and fails if
 * any shown option is wrong. An expected honest "no" is FULL when there is
 * no plan and FAILED when we pretend otherwise.
 */
export function assessScenario(
  intent: PlanIntent,
  proposals: PlanProposal[],
  regressionFailures: string[] = [],
  options: { requires?: ExperienceKey[]; expectsNoPlan?: boolean } = {},
): { satisfaction: Satisfaction; proposals: ProposalAssessment[] } {
  const assessments = proposals.map((proposal) =>
    assessProposal(intent, proposal, options.requires),
  );
  if (options.expectsNoPlan) {
    // Honest refusal (with diagnostics in the trace) is the right answer;
    // options that stay explicitly unproven are honest but not decisive; a
    // claimed fit, or a requested experience silently dropped, is wrong.
    const claimsFit = proposals.some((p) => p.budgetStatus === 'WITHIN');
    const silentDrop = assessments.some((a) => a.missingExperiences.length > 0);
    return {
      satisfaction:
        regressionFailures.length || claimsFit || silentDrop
          ? 'FAILED'
          : proposals.length
            ? 'UNCERTAIN'
            : 'FULL',
      proposals: assessments,
    };
  }
  if (!proposals.length || regressionFailures.length)
    return { satisfaction: 'FAILED', proposals: assessments };
  if (assessments.some((a) => a.satisfaction === 'FAILED'))
    return { satisfaction: 'FAILED', proposals: assessments };
  return { satisfaction: assessments[0].satisfaction, proposals: assessments };
}
