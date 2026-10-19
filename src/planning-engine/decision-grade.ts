/**
 * Decision-grade: enough evidence for SmartPlan to actively recommend a
 * stop, not just to show it. Explore may list anything; the best plan may
 * only contain stops whose opening state and price are known:
 *
 * - hours: official/curated/fresh durable hours or a live verification that
 *   speak for that weekday; a dated screening (it happens at its time); a
 *   public space (a plaza or a viewpoint has no door); an official offering
 *   with its own schedule.
 * - price: anything but UNKNOWN (FREE needs evidence upstream).
 */
import { hoursKnownFor, type PlanCandidate } from './candidate';

export function hoursDecisionGrade(
  candidate: PlanCandidate,
  weekday: number,
  start: number,
): boolean {
  if (candidate.kind === 'SCREENING') return true;
  if (candidate.connective && candidate.price.priceKind === 'FREE') return true;
  if (candidate.hours) return hoursKnownFor(candidate.hours, weekday, start);
  return (
    candidate.kind === 'OFFERING' && candidate.availableTimesOfDay.length > 0
  );
}

export function priceDecisionGrade(candidate: PlanCandidate): boolean {
  return candidate.price.priceKind !== 'UNKNOWN';
}

export function isDecisionGrade(
  candidate: PlanCandidate,
  weekday: number,
  start: number,
): boolean {
  return (
    !candidate.closedPermanently &&
    priceDecisionGrade(candidate) &&
    hoursDecisionGrade(candidate, weekday, start)
  );
}

/** Ranking penalty of a stop SmartPlan cannot yet stand behind. */
export const NOT_DECISION_GRADE_PENALTY = 0.22;
