import { CandidateActivity } from './dto/candidate-activity.dto';
import { ComposedPlan } from './gemini/dto/compose-plans.dto';
import type { TravelMode } from '../common/types/travel-mode';

export const CANDIDATE_POOL_LIMIT = 80;
export const PROMPT_CANDIDATE_LIMIT = 24;

/** A stable shortlist with a small diversity bonus, never random sampling. */
export function shortlistCandidates(
  pool: CandidateActivity[],
  limit = PROMPT_CANDIDATE_LIMIT,
): CandidateActivity[] {
  const pending = [...pool];
  const selected: CandidateActivity[] = [];
  const categories = new Set<string>();
  while (pending.length && selected.length < limit) {
    pending.sort((a, b) => {
      const value = (candidate: CandidateActivity) =>
        (candidate.relevanceScore ?? 0) +
        candidate.categoryNames.filter((name) => !categories.has(name)).length *
          0.25;
      return (
        value(b) - value(a) || a.estimatedCost - b.estimatedCost || a.id - b.id
      );
    });
    const candidate = pending.shift()!;
    selected.push(candidate);
    candidate.categoryNames.forEach((name) => categories.add(name));
  }
  return selected;
}

export function distanceBetween(
  a: CandidateActivity,
  b: CandidateActivity,
): number {
  if (
    a.latitude == null ||
    a.longitude == null ||
    b.latitude == null ||
    b.longitude == null
  )
    return 0;
  const rad = Math.PI / 180;
  const value =
    Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, value)));
}

/** Conservative road-time proxy used only for composition, not advertised as a real route. */
export function estimatedTravelMinutes(
  candidates: CandidateActivity[],
  travelMode: TravelMode = 'drive',
): number {
  const speedKmPerHour = { drive: 25, walk: 4.5, bicycle: 12 }[travelMode];
  return candidates
    .slice(1)
    .reduce(
      (minutes, current, index) =>
        minutes +
        (distanceBetween(candidates[index], current) / speedKmPerHour) *
          60 *
          1.3,
      0,
    );
}

export function deterministicPlans(
  candidates: CandidateActivity[],
  budget: number | null,
  duration: number | null,
  travelMode: TravelMode = 'drive',
): ComposedPlan[] {
  const plans: ComposedPlan[] = [];
  const keys = new Set<string>();
  // Each leading candidate seeds a distinct alternative; additions preserve the hard limits.
  for (const first of candidates.slice(0, 6)) {
    const chosen = [first];
    const compatible = (items: CandidateActivity[]) =>
      items.reduce((sum, item) => sum + item.estimatedCost, 0) <=
        Math.min(budget ?? 99999999.99, 99999999.99) &&
      (duration == null ||
        items.reduce((sum, item) => sum + item.estimatedDuration, 0) +
          estimatedTravelMinutes(items, travelMode) <=
          duration);
    if (!compatible(chosen)) continue;
    const remaining = candidates.filter(
      (candidate) => candidate.id !== first.id,
    );
    while (remaining.length && chosen.length < 4) {
      remaining.sort(
        (a, b) =>
          (b.relevanceScore ?? 0) -
            distanceBetween(chosen.at(-1)!, b) * 0.1 -
            ((a.relevanceScore ?? 0) -
              distanceBetween(chosen.at(-1)!, a) * 0.1) || a.id - b.id,
      );
      const next = remaining.shift()!;
      if (compatible([...chosen, next])) chosen.push(next);
    }
    const key = chosen
      .map(({ id }) => id)
      .sort((a, b) => a - b)
      .join(',');
    if (keys.has(key)) continue;
    keys.add(key);
    plans.push({
      title:
        chosen.length === 1
          ? first.name.slice(0, 60)
          : `${first.name} y más`.slice(0, 60),
      description: chosen
        .map(({ name }) => name)
        .join(' · ')
        .slice(0, 140),
      activities: chosen.map(({ id }, index) => ({
        activityId: id,
        order: index + 1,
      })),
    });
  }
  return plans;
}
