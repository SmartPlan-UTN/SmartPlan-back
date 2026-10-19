/**
 * The planner's explanation of a generated plan, as the person sees it. It
 * never exposes internal scores: only the role, plain reasons, the honest
 * uncertainties and the evidence behind each stop.
 */
/** Evidence-only facts about one stop for the result card. */
export interface StopInsightDto {
  purpose: string;
  price: string | null;
  priceSource: string | null;
  /** The price was read live from Google Maps (shown by Google's own UI). */
  priceLive: boolean;
  hours: string | null;
  hoursSource: string | null;
  fit: string | null;
  order: {
    name: string;
    lines: { quantity: number; item: string; unitPrice: number }[];
    total: number;
    sourceUrl: string;
    observedAt: string;
  } | null;
  attribution: 'Google Maps' | 'OpenStreetMap' | null;
}

export interface PlanInsightStopDto {
  label: string;
  evidence: string[];
  caveats: string[];
  insight: StopInsightDto | null;
}

/** Real counts of places SmartPlan ruled out for the person. */
export interface DiscardedDto {
  overBudget: number;
  tooFar: number;
  closedForGood: number;
  closedAtTime: number;
}

export interface PlanInsightDto {
  role: 'BEST' | 'VALUE' | 'DIFFERENT' | 'ALTERNATIVE';
  roleLabel: string;
  why: string;
  /** What the place is, in a line, from evidence only. */
  tagline: string | null;
  /** The request said back ("Pediste algo fachero para tomar algo."). */
  echo: string | null;
  difference: string | null;
  uncertainties: string[];
  /** WITHIN = shown to fit; UNCERTAIN = possible but unproven; EXCEEDS. */
  budgetStatus: 'WITHIN' | 'UNCERTAIN' | 'EXCEEDS' | 'NO_BUDGET';
  travelMinutes: number | null;
  travelKm: number | null;
  stops: PlanInsightStopDto[];
  /** Every stop has known hours and a usable price (and fits a strict budget). */
  decisionGrade: boolean;
  /** Only on the best plan. */
  discarded: DiscardedDto | null;
  /** Some prices were checked live in Google Maps (verdict only is saved). */
  priceBasis: 'PROVIDER_LIVE' | null;
  /** When those live prices were checked (ISO); old plans are not rechecked. */
  priceCheckedAt: string | null;
  /** Required experiences the plan does not cover. */
  missingExperiences: string[];
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.length ? value : null;
const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;

function stopInsightOf(value: unknown): StopInsightDto | null {
  if (typeof value !== 'object' || value === null) return null;
  const insight = value as Record<string, unknown>;
  const purpose = text(insight.purpose);
  if (!purpose) return null;
  const order =
    typeof insight.order === 'object' && insight.order !== null
      ? (insight.order as Record<string, unknown>)
      : null;
  const lines = Array.isArray(order?.lines)
    ? (order.lines as unknown[])
        .filter(
          (line): line is Record<string, unknown> =>
            typeof line === 'object' && line !== null,
        )
        .map((line) => ({
          quantity: count(line.quantity),
          item: text(line.item) ?? '',
          unitPrice: count(line.unitPrice),
        }))
        .filter((line) => line.item && line.quantity > 0)
    : [];
  return {
    purpose,
    price: text(insight.price),
    priceSource: text(insight.priceSource),
    priceLive: insight.priceLive === true,
    hours: text(insight.hours),
    hoursSource: text(insight.hoursSource),
    fit: text(insight.fit),
    order:
      order && lines.length && text(order.sourceUrl)
        ? {
            name: text(order.name) ?? '',
            lines,
            total: count(order.total),
            sourceUrl: text(order.sourceUrl)!,
            observedAt: text(order.observedAt) ?? '',
          }
        : null,
    attribution:
      insight.attribution === 'Google Maps' ||
      insight.attribution === 'OpenStreetMap'
        ? insight.attribution
        : null,
  };
}

function discardedOf(value: unknown): DiscardedDto | null {
  if (typeof value !== 'object' || value === null) return null;
  const discarded = value as Record<string, unknown>;
  return {
    overBudget: count(discarded.overBudget),
    tooFar: count(discarded.tooFar),
    closedForGood: count(discarded.closedForGood),
    closedAtTime: count(discarded.closedAtTime),
  };
}

const ROLES = new Set(['BEST', 'VALUE', 'DIFFERENT', 'ALTERNATIVE']);
const BUDGET = new Set(['WITHIN', 'UNCERTAIN', 'EXCEEDS', 'NO_BUDGET']);
/** Plans saved before the evidence-only budget states. */
const LEGACY_BUDGET: Record<string, PlanInsightDto['budgetStatus']> = {
  MAY_EXCEED: 'UNCERTAIN',
  UNKNOWN: 'UNCERTAIN',
};

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

/** Reads the public explanation out of `plan.ranking_meta` (or null). */
export function insightOf(
  rankingMeta: Record<string, unknown> | null | undefined,
): PlanInsightDto | null {
  if (!rankingMeta || typeof rankingMeta.role !== 'string') return null;
  if (!ROLES.has(rankingMeta.role)) return null;
  const stops = Array.isArray(rankingMeta.stops) ? rankingMeta.stops : [];
  return {
    role: rankingMeta.role as PlanInsightDto['role'],
    roleLabel:
      typeof rankingMeta.roleLabel === 'string' ? rankingMeta.roleLabel : '',
    why: typeof rankingMeta.why === 'string' ? rankingMeta.why : '',
    tagline: text(rankingMeta.tagline),
    echo: text(rankingMeta.echo),
    difference:
      typeof rankingMeta.difference === 'string'
        ? rankingMeta.difference
        : null,
    uncertainties: strings(rankingMeta.uncertainties),
    budgetStatus: BUDGET.has(String(rankingMeta.budgetStatus))
      ? (rankingMeta.budgetStatus as PlanInsightDto['budgetStatus'])
      : (LEGACY_BUDGET[String(rankingMeta.budgetStatus)] ?? 'NO_BUDGET'),
    travelMinutes:
      typeof rankingMeta.travelMinutes === 'number'
        ? rankingMeta.travelMinutes
        : null,
    travelKm:
      typeof rankingMeta.travelKm === 'number' ? rankingMeta.travelKm : null,
    stops: stops
      .filter(
        (stop): stop is Record<string, unknown> =>
          typeof stop === 'object' && stop !== null,
      )
      .map((stop) => ({
        label: typeof stop.label === 'string' ? stop.label : '',
        evidence: strings(stop.evidence),
        caveats: strings(stop.caveats),
        insight: stopInsightOf(stop.insight),
      })),
    decisionGrade: rankingMeta.decisionGrade === true,
    discarded: discardedOf(rankingMeta.discarded),
    priceBasis:
      rankingMeta.priceBasis === 'PROVIDER_LIVE' ? 'PROVIDER_LIVE' : null,
    missingExperiences: strings(rankingMeta.missingExperiences),
    priceCheckedAt:
      rankingMeta.priceBasis === 'PROVIDER_LIVE'
        ? text(rankingMeta.priceCheckedAt)
        : null,
  };
}
