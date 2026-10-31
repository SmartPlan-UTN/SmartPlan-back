import type { PriceFields } from '../common/pricing/price';
import { PRICE_STALE_AFTER_DAYS } from '../common/pricing/price';

/**
 * SmartPlan's own price evidence: what people report they paid for ONE
 * activity. Deliberately simple for v1 (a recency-weighted robust range), not
 * a statistical engine:
 *
 * - only observations from the last `lookbackDays` count (prices move fast, a
 *   stale report describes a different price);
 * - each observation is weighted by `0.5 ^ (age / halfLifeDays)`;
 * - outliers (far from the weighted median in MAD terms) are discarded;
 * - fewer than `minObservations` remaining means "no estimate", never a guess;
 * - the result is a range (weighted p25..p75) so the dispersion is honest.
 *
 * Pure functions: no database.
 */

export interface PriceObservationInput {
  /** Normalised to a per-person amount (ARS) when the report was recorded. */
  amountPerPerson: number;
  observedAt: Date;
}

export interface ObservedPriceEstimate {
  kind: 'FIXED' | 'RANGE';
  min: number;
  max: number;
  /** Observations that survived the outlier filter. */
  count: number;
  /** Most recent observation used. */
  newestAt: Date;
}

export interface EstimatorOptions {
  now: Date;
  lookbackDays: number;
  halfLifeDays: number;
  minObservations: number;
  /** Amounts are rounded to this step so the estimate is not falsely exact. */
  roundTo: number;
}

export const DEFAULT_ESTIMATOR_OPTIONS: Omit<EstimatorOptions, 'now'> = {
  lookbackDays: 180,
  halfLifeDays: 45,
  minObservations: 3,
  roundTo: 500,
};

const DAY_MS = 86_400_000;

function weightedQuantile(
  items: Array<{ value: number; weight: number }>,
  q: number,
): number {
  const sorted = [...items].sort((a, b) => a.value - b.value);
  const total = sorted.reduce((sum, item) => sum + item.weight, 0);
  let cumulative = 0;
  for (const item of sorted) {
    cumulative += item.weight;
    if (cumulative / total >= q) return item.value;
  }
  return sorted[sorted.length - 1].value;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function estimateFromObservations(
  observations: PriceObservationInput[],
  options: Partial<EstimatorOptions> = {},
): ObservedPriceEstimate | null {
  const opts: EstimatorOptions = {
    ...DEFAULT_ESTIMATOR_OPTIONS,
    now: new Date(),
    ...options,
  };

  const recent = observations.filter((o) => {
    const age = (opts.now.getTime() - o.observedAt.getTime()) / DAY_MS;
    return (
      Number.isFinite(o.amountPerPerson) &&
      o.amountPerPerson > 0 &&
      age >= 0 &&
      age <= opts.lookbackDays
    );
  });
  if (recent.length < opts.minObservations) return null;

  const weighted = recent.map((o) => ({
    value: o.amountPerPerson,
    observedAt: o.observedAt,
    weight: Math.pow(
      0.5,
      (opts.now.getTime() - o.observedAt.getTime()) /
        DAY_MS /
        opts.halfLifeDays,
    ),
  }));

  // Robust outlier filter around the weighted median (needs enough points to
  // mean anything; below that the minimum-observation rule is the guard).
  let kept = weighted;
  if (weighted.length >= 5) {
    const center = weightedQuantile(weighted, 0.5);
    const mad = median(weighted.map((o) => Math.abs(o.value - center)));
    if (mad > 0) {
      const limit = 3.5 * 1.4826 * mad;
      kept = weighted.filter((o) => Math.abs(o.value - center) <= limit);
    }
  }
  if (kept.length < opts.minObservations) return null;

  const step = opts.roundTo;
  const round = (value: number) =>
    Math.max(step, Math.round(value / step) * step);
  const min = round(weightedQuantile(kept, 0.25));
  const max = round(weightedQuantile(kept, 0.75));
  const newestAt = new Date(
    Math.max(...kept.map((o) => o.observedAt.getTime())),
  );

  return min >= max
    ? { kind: 'FIXED', min, max: min, count: kept.length, newestAt }
    : { kind: 'RANGE', min, max, count: kept.length, newestAt };
}

/**
 * Whether the observed estimate should become the activity's price.
 *
 * Precedence: a current, verified OFFICIAL/CURATED price wins over what people
 * report. User evidence takes over only when the existing price is missing, is
 * not official/curated, or is stale AND older than the newest observation.
 */
export function shouldApplyObservedEstimate(
  current: Pick<PriceFields, 'priceKind' | 'priceSource' | 'priceVerifiedAt'>,
  estimate: Pick<ObservedPriceEstimate, 'newestAt'>,
  now: Date = new Date(),
): boolean {
  if (current.priceKind === 'UNKNOWN') return true;
  if (current.priceSource === 'USER_REPORTED') return true;
  if (current.priceSource !== 'OFFICIAL' && current.priceSource !== 'CURATED') {
    return true; // LEGACY / PROVIDER_HINT
  }
  const verifiedAt = current.priceVerifiedAt;
  if (!verifiedAt) return true;
  const ageDays = (now.getTime() - verifiedAt.getTime()) / DAY_MS;
  return (
    ageDays > PRICE_STALE_AFTER_DAYS &&
    estimate.newestAt.getTime() > verifiedAt.getTime()
  );
}
