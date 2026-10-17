/**
 * Price model shared by activities, plan-detail snapshots and plan totals.
 *
 * Core rule: an unknown price is NOT a free price. `UNKNOWN` carries no amounts
 * and never contributes to a total; `FREE` requires positive evidence and is the
 * only kind that is genuinely zero.
 */

export const PRICE_KINDS = [
  'FREE',
  'FIXED',
  'FROM',
  'RANGE',
  'UNKNOWN',
] as const;
export type PriceKind = (typeof PRICE_KINDS)[number];

/**
 * What an amount is "per". `UNSPECIFIED` is the legacy meaning: the number was
 * added to plan totals as-is (a group amount) and divided by the party size for
 * the per-person view. Newly curated prices must state a real unit.
 */
export const PRICE_UNITS = [
  'PER_PERSON',
  'PER_GROUP',
  'ENTRY',
  'CONSUMPTION',
  'UNSPECIFIED',
] as const;
export type PriceUnit = (typeof PRICE_UNITS)[number];

/** Ordered from most to least trustworthy (UNKNOWN has no source). */
export const PRICE_SOURCES = [
  'OFFICIAL',
  'CURATED',
  'USER_REPORTED',
  'PROVIDER_HINT',
  'LEGACY',
] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

export const PRICE_CONFIDENCES = ['HIGH', 'MEDIUM', 'LOW', 'NONE'] as const;
export type PriceConfidence = (typeof PRICE_CONFIDENCES)[number];

export const PRICE_COMPLETENESS = [
  'EXACT',
  'RANGE',
  'LOWER_BOUND',
  'PARTIAL',
  'NONE',
] as const;
export type PriceCompleteness = (typeof PRICE_COMPLETENESS)[number];

export const DEFAULT_PRICE_CURRENCY = 'ARS';

/** Days after which a verified price is considered stale. */
export const PRICE_STALE_AFTER_DAYS = 90;

export interface PriceFields {
  priceKind: PriceKind;
  priceMin: number | null;
  priceMax: number | null;
  priceUnit: PriceUnit | null;
  priceCurrency: string;
  priceSource: PriceSource | null;
  priceSourceRef: string | null;
  priceVerifiedAt: Date | null;
}

export type PriceInput = Partial<PriceFields> & { priceKind: PriceKind };

export const UNKNOWN_PRICE: PriceFields = {
  priceKind: 'UNKNOWN',
  priceMin: null,
  priceMax: null,
  priceUnit: null,
  priceCurrency: DEFAULT_PRICE_CURRENCY,
  priceSource: null,
  priceSourceRef: null,
  priceVerifiedAt: null,
};

export class InvalidPriceError extends Error {}

const MAX_AMOUNT = 99_999_999.99;

function isAmount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_AMOUNT
  );
}

/**
 * Normalises and validates a price. Throws `InvalidPriceError` for any
 * combination the database CHECK constraints would reject, so the API fails
 * with a message instead of a constraint violation.
 */
export function normalizePrice(input: PriceInput): PriceFields {
  const kind = input.priceKind;
  if (!PRICE_KINDS.includes(kind)) {
    throw new InvalidPriceError(`Unknown price kind: ${String(kind)}`);
  }
  const currency = input.priceCurrency ?? DEFAULT_PRICE_CURRENCY;
  if (currency !== DEFAULT_PRICE_CURRENCY) {
    throw new InvalidPriceError('Only ARS prices are supported.');
  }
  const min = input.priceMin ?? null;
  const max = input.priceMax ?? null;
  const unit = input.priceUnit ?? null;
  const source = input.priceSource ?? null;
  if (unit !== null && !PRICE_UNITS.includes(unit)) {
    throw new InvalidPriceError(`Unknown price unit: ${String(unit)}`);
  }
  if (source !== null && !PRICE_SOURCES.includes(source)) {
    throw new InvalidPriceError(`Unknown price source: ${String(source)}`);
  }

  if (kind === 'UNKNOWN') {
    // Whatever amounts were supplied are discarded: an unknown price has none.
    return { ...UNKNOWN_PRICE };
  }

  if (source === null) {
    throw new InvalidPriceError('A known price needs a source.');
  }
  if (unit === null) {
    throw new InvalidPriceError('A known price needs a unit.');
  }

  let priceMin: number;
  let priceMax: number | null;
  switch (kind) {
    case 'FREE':
      if ((min ?? 0) !== 0 || (max ?? 0) !== 0) {
        throw new InvalidPriceError('A free price cannot have an amount.');
      }
      if (source === 'PROVIDER_HINT' || source === 'LEGACY') {
        throw new InvalidPriceError(
          'FREE needs positive evidence (official, curated or user reported).',
        );
      }
      priceMin = 0;
      priceMax = 0;
      break;
    case 'FIXED':
      if (!isAmount(min) || (max !== null && max !== min)) {
        throw new InvalidPriceError('A fixed price needs one valid amount.');
      }
      priceMin = min;
      priceMax = min;
      break;
    case 'FROM':
      if (!isAmount(min) || max !== null) {
        throw new InvalidPriceError(
          'A "from" price needs a minimum amount and no maximum.',
        );
      }
      priceMin = min;
      priceMax = null;
      break;
    case 'RANGE':
      if (!isAmount(min) || !isAmount(max) || max <= min) {
        throw new InvalidPriceError(
          'A range needs a minimum amount lower than its maximum.',
        );
      }
      priceMin = min;
      priceMax = max;
      break;
  }

  return {
    priceKind: kind,
    priceMin,
    priceMax,
    priceUnit: unit,
    priceCurrency: currency,
    priceSource: source,
    priceSourceRef: input.priceSourceRef ?? null,
    priceVerifiedAt: input.priceVerifiedAt ?? null,
  };
}

/**
 * Representative single amount kept in the legacy `estimated_cost` column:
 * the lower bound of a known price, `null` when unknown. Never `0` for UNKNOWN.
 */
export function legacyEstimatedCost(price: {
  priceKind: PriceKind;
  priceMin: number | null;
}): number | null {
  return price.priceKind === 'UNKNOWN' ? null : price.priceMin;
}

export function isKnownPrice(price: { priceKind: PriceKind }): boolean {
  return price.priceKind !== 'UNKNOWN';
}

export function priceConfidence(
  price: Pick<PriceFields, 'priceKind' | 'priceSource'>,
): PriceConfidence {
  if (price.priceKind === 'UNKNOWN' || price.priceSource === null) {
    return 'NONE';
  }
  switch (price.priceSource) {
    case 'OFFICIAL':
    case 'CURATED':
      return 'HIGH';
    case 'USER_REPORTED':
      return 'MEDIUM';
    default:
      return 'LOW';
  }
}

export function isPriceStale(
  price: Pick<PriceFields, 'priceKind' | 'priceVerifiedAt'>,
  now: Date = new Date(),
  maxAgeDays: number = PRICE_STALE_AFTER_DAYS,
): boolean {
  if (price.priceKind === 'UNKNOWN') {
    return false;
  }
  if (!price.priceVerifiedAt) {
    return true;
  }
  const ageDays =
    (now.getTime() - price.priceVerifiedAt.getTime()) / 86_400_000;
  return ageDays > maxAgeDays;
}

/** Group multiplier for an amount, given the party size. */
function groupFactor(unit: PriceUnit | null, peopleCount: number): number {
  switch (unit) {
    case 'PER_PERSON':
    case 'ENTRY':
    case 'CONSUMPTION':
      return Math.max(1, peopleCount);
    default:
      return 1;
  }
}

export interface PlanPriceTotals {
  /** Known lower bound for the whole group; `null` when nothing is priced. */
  totalMin: number | null;
  /** Upper bound; `null` when open-ended (any FROM) or nothing is priced. */
  totalMax: number | null;
  unpricedCount: number;
  completeness: PriceCompleteness;
}

/**
 * Aggregates plan-detail snapshots into a group total:
 *   FREE → 0/0, FIXED → x/x, FROM → x/open, RANGE → a/b, UNKNOWN → unpriced.
 * An unknown item never adds an amount and always makes the total PARTIAL (or
 * NONE when nothing at all is priced).
 */
export function computePlanTotals(
  details: Array<
    Pick<PriceFields, 'priceKind' | 'priceMin' | 'priceMax' | 'priceUnit'>
  >,
  peopleCount: number,
): PlanPriceTotals {
  let min = 0;
  let max = 0;
  let open = false;
  let hasRange = false;
  let hasFrom = false;
  let unpriced = 0;
  let priced = 0;

  for (const detail of details) {
    if (detail.priceKind === 'UNKNOWN') {
      unpriced += 1;
      continue;
    }
    priced += 1;
    const factor = groupFactor(detail.priceUnit, peopleCount);
    const lo = (detail.priceMin ?? 0) * factor;
    min += lo;
    if (detail.priceKind === 'FROM') {
      open = true;
      hasFrom = true;
    } else {
      max += (detail.priceMax ?? detail.priceMin ?? 0) * factor;
      if (detail.priceKind === 'RANGE') {
        hasRange = true;
      }
    }
  }

  const round = (value: number) => Math.round(value * 100) / 100;

  if (priced === 0 && unpriced > 0) {
    return {
      totalMin: null,
      totalMax: null,
      unpricedCount: unpriced,
      completeness: 'NONE',
    };
  }

  let completeness: PriceCompleteness = 'EXACT';
  if (unpriced > 0) {
    completeness = 'PARTIAL';
  } else if (hasFrom) {
    completeness = 'LOWER_BOUND';
  } else if (hasRange) {
    completeness = 'RANGE';
  }

  return {
    totalMin: round(min),
    // Unpriced items have no upper bound, so a PARTIAL total is open-ended.
    totalMax: open || unpriced > 0 ? null : round(max),
    unpricedCount: unpriced,
    completeness,
  };
}

/** Spanish description of a price for prompts and plain-text surfaces. */
export function describePrice(price: PriceFields): string {
  const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`;
  const unit = unitSuffix(price.priceUnit);
  switch (price.priceKind) {
    case 'FREE':
      return 'gratis';
    case 'FIXED':
      return `${fmt(price.priceMin ?? 0)}${unit}`;
    case 'FROM':
      return `desde ${fmt(price.priceMin ?? 0)}${unit}`;
    case 'RANGE':
      return `entre ${fmt(price.priceMin ?? 0)} y ${fmt(price.priceMax ?? 0)}${unit}`;
    default:
      return 'precio no disponible';
  }
}

function unitSuffix(unit: PriceUnit | null): string {
  switch (unit) {
    case 'PER_PERSON':
    case 'ENTRY':
    case 'CONSUMPTION':
      return ' por persona';
    case 'PER_GROUP':
      return ' por grupo';
    default:
      return '';
  }
}

/** Raw (string-typed) price columns as returned by `getRawMany`. */
export interface PriceRow {
  priceKind: PriceKind;
  priceMin: string | number | null;
  priceMax: string | number | null;
  priceUnit: PriceUnit | null;
  priceCurrency: string;
  priceSource: PriceSource | null;
  priceSourceRef: string | null;
  priceVerifiedAt: Date | string | null;
}

/** `[expression, alias]` pairs for `addSelect`, for a TypeORM entity alias. */
export function priceSelects(alias: string): Array<[string, string]> {
  return [
    'priceKind',
    'priceMin',
    'priceMax',
    'priceUnit',
    'priceCurrency',
    'priceSource',
    'priceSourceRef',
    'priceVerifiedAt',
  ].map((field) => [`${alias}.${field}`, field]);
}

const toNumberOrNull = (value: string | number | null): number | null =>
  value === null || value === undefined ? null : Number(value);

export function priceFromRow(row: PriceRow): PriceFields {
  return {
    priceKind: row.priceKind,
    priceMin: toNumberOrNull(row.priceMin),
    priceMax: toNumberOrNull(row.priceMax),
    priceUnit: row.priceUnit,
    priceCurrency: row.priceCurrency,
    priceSource: row.priceSource,
    priceSourceRef: row.priceSourceRef,
    priceVerifiedAt: row.priceVerifiedAt ? new Date(row.priceVerifiedAt) : null,
  };
}

/** Picks the price fields out of an Activity/PlanDetail-shaped object. */
export function pickPrice(source: PriceFields): PriceFields {
  return {
    priceKind: source.priceKind,
    priceMin: source.priceMin,
    priceMax: source.priceMax,
    priceUnit: source.priceUnit,
    priceCurrency: source.priceCurrency,
    priceSource: source.priceSource,
    priceSourceRef: source.priceSourceRef,
    priceVerifiedAt: source.priceVerifiedAt,
  };
}

/** Public shape of a price in API responses. */
export interface PriceDto {
  kind: PriceKind;
  min: number | null;
  max: number | null;
  unit: PriceUnit | null;
  currency: string;
  source: PriceSource | null;
  sourceRef: string | null;
  verifiedAt: Date | null;
  confidence: PriceConfidence;
  stale: boolean;
}

export function toPriceDto(price: PriceFields): PriceDto {
  return {
    kind: price.priceKind,
    min: price.priceMin,
    max: price.priceMax,
    unit: price.priceUnit,
    currency: price.priceCurrency,
    source: price.priceSource,
    sourceRef: price.priceSourceRef,
    verifiedAt: price.priceVerifiedAt,
    confidence: priceConfidence(price),
    stale: isPriceStale(price),
  };
}

/** Writes a normalised price onto an Activity/PlanDetail-shaped target. */
export function assignPrice(
  target: PriceFields & { estimatedCost: number | null },
  price: PriceFields,
): void {
  target.priceKind = price.priceKind;
  target.priceMin = price.priceMin;
  target.priceMax = price.priceMax;
  target.priceUnit = price.priceUnit;
  target.priceCurrency = price.priceCurrency;
  target.priceSource = price.priceSource;
  target.priceSourceRef = price.priceSourceRef;
  target.priceVerifiedAt = price.priceVerifiedAt;
  target.estimatedCost = legacyEstimatedCost(price);
}

/**
 * Values to persist on a new plan_detail row so it carries an immutable
 * snapshot of the activity's price as it was when the activity was added.
 */
export function snapshotValues(
  price: PriceFields,
  now: Date = new Date(),
): PriceFields & { estimatedCost: number | null; priceSnapshotAt: Date } {
  return {
    ...pickPrice(price),
    estimatedCost: legacyEstimatedCost(price),
    priceSnapshotAt: now,
  };
}

/** Plan-level price summary exposed by every plan projection. */
export interface PlanPriceSummaryDto {
  /** Known lower bound of the group total; `null` when nothing is priced. */
  estimatedTotalCost: number | null;
  /** Upper bound; `null` when open-ended or unpriced. */
  estimatedTotalCostMax: number | null;
  unpricedCount: number;
  priceCompleteness: PriceCompleteness;
}

export function planPriceSummary(plan: {
  estimatedTotalCost: number | null;
  estimatedTotalCostMax: number | null;
  unpricedCount: number;
  priceCompleteness: PriceCompleteness;
}): PlanPriceSummaryDto {
  return {
    estimatedTotalCost: plan.estimatedTotalCost,
    estimatedTotalCostMax: plan.estimatedTotalCostMax,
    unpricedCount: plan.unpricedCount,
    priceCompleteness: plan.priceCompleteness,
  };
}

/** Per-person lower bound, `null` when nothing is priced. */
export function costPerPerson(
  total: number | null,
  peopleCount: number,
): number | null {
  if (total === null) return null;
  return Math.round((total / Math.max(1, peopleCount)) * 100) / 100;
}
