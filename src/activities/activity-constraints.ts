export const TIMES_OF_DAY = [
  'morning',
  'afternoon',
  'evening',
  'night',
] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];
export const COST_BASES = ['per_party', 'per_person'] as const;
export type CostBasis = (typeof COST_BASES)[number];

export interface ActivityConstraints {
  costBasis?: CostBasis;
  availableTimesOfDay?: TimeOfDay[];
  minPeople?: number | null;
  maxPeople?: number | null;
}

export function groupCost(
  cost: number,
  basis: CostBasis | undefined,
  partySize: number | null,
): number {
  return (
    Math.round(cost * (basis === 'per_person' ? (partySize ?? 1) : 1) * 100) /
    100
  );
}

export function matchesActivityConstraints(
  activity: ActivityConstraints,
  timeOfDay: TimeOfDay | null,
  partySize: number | null,
): boolean {
  if (
    timeOfDay &&
    activity.availableTimesOfDay?.length &&
    !activity.availableTimesOfDay.includes(timeOfDay)
  )
    return false;
  if (
    partySize !== null &&
    activity.minPeople != null &&
    partySize < activity.minPeople
  )
    return false;
  if (
    partySize !== null &&
    activity.maxPeople != null &&
    partySize > activity.maxPeople
  )
    return false;
  return true;
}
