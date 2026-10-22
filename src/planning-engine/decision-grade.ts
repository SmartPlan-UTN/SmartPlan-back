/**
 * Decision-grade: enough evidence for SmartPlan to actively recommend a
 * stop with known opening state and price. Plans may also expose uncertain
 * alternatives with their missing evidence; this classification never turns
 * those alternatives into a proven budget fit or a Ready outing:
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
