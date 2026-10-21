/**
 * Google Maps Platform cost model used by SmartPlan's own guards, so the
 * application stops a run before the invoice could surprise anyone; billing
 * alerts are never the safety mechanism. Prices are rounded up, and only
 * FREE_ALLOWANCE_SHARE of each SKU's free monthly allowance is trusted (the
 * allowance is project-wide and other environments may use part of it).
 * Re-check the Cloud Console pricing before changing any number here.
 *
 * Per-request SKU prices (Places API New, 2026 list prices, first tier):
 * - Text Search with rating/price fields (Enterprise): ~US$35 / 1000
 * - Text Search for identity only (Pro): ~US$32 / 1000, 5,000 free a month
 * - Place Details with rating/price fields (Enterprise): ~US$20 / 1000
 * - Place Details "IDs only" (id, photos, attributions): free, unlimited
 * - Place Details Photos (one photo URI): US$7 / 1000, 1,000 free a month
 * - Places UI Kit Query (one element instantiation): US$1 / 1000, 10,000 free
 */
export const GOOGLE_UNIT_COST_USD = {
  textSearch: 0.04,
  textSearchPro: 0.032,
  placeDetails: 0.025,
  placePhoto: 0.007,
  uiKitQuery: 0.001,
  idsOnly: 0,
} as const;

export type GoogleSku = keyof typeof GOOGLE_UNIT_COST_USD;

/** Free monthly usage Google grants per SKU (project-wide). */
export const GOOGLE_FREE_MONTHLY_REQUESTS: Partial<Record<GoogleSku, number>> =
  {
    textSearch: 1000,
    textSearchPro: 5000,
    placeDetails: 1000,
    placePhoto: 1000,
    uiKitQuery: 10000,
  };

/**
 * Share of a free monthly allowance SmartPlan's money guard counts on. The
 * rest is a margin for other environments sharing the Google project.
 */
export const FREE_ALLOWANCE_SHARE = 0.8;

/** Requests of a SKU this guard treats as free each month. */
export function trustedFreeRequests(sku: GoogleSku): number {
  return Math.floor(
    (GOOGLE_FREE_MONTHLY_REQUESTS[sku] ?? 0) * FREE_ALLOWANCE_SHARE,
  );
}

/**
 * USD 0 paid-spend caps enforced by SmartPlan for the photo paths, below the
 * free allowance so a counting race or another consumer of the same project
 * cannot push them into paid usage. Configurable downwards only.
 */
export const PHOTO_MONTHLY_HARD_CAP = 900;
export const UI_KIT_MONTHLY_HARD_CAP = 9000;

/** Clamp a configured cap into [0, hard cap]. */
export function effectiveMonthlyCap(
  configured: number | undefined,
  hardCap: number,
): number {
  if (configured === undefined || !Number.isFinite(configured)) return hardCap;
  return Math.max(0, Math.min(hardCap, Math.floor(configured)));
}

/**
 * Usage contexts recorded in `external_data_usage` and the SKU each one is
 * billed as. A context that is not listed here must not make paid calls.
 */
export const GOOGLE_SKU_BY_CONTEXT = {
  'external-sync': 'placeDetails',
  'external-sync-search': 'textSearch',
  'catalog-match': 'textSearch',
  'catalog-match-pro': 'textSearchPro',
  'place-refresh': 'placeDetails',
  'place-photo': 'placePhoto',
  'ui-kit': 'uiKitQuery',
} as const satisfies Record<string, GoogleSku>;

export type GoogleUsageContext = keyof typeof GOOGLE_SKU_BY_CONTEXT;

export interface GoogleRequestPlan {
  textSearches: number;
  placeDetails: number;
  placePhotos?: number;
}

export interface GoogleCostEstimate {
  requests: number;
  costUsd: number;
}

export function estimateGoogleCost(
  plan: GoogleRequestPlan,
): GoogleCostEstimate {
  const photos = plan.placePhotos ?? 0;
  const costUsd =
    plan.textSearches * GOOGLE_UNIT_COST_USD.textSearch +
    plan.placeDetails * GOOGLE_UNIT_COST_USD.placeDetails +
    photos * GOOGLE_UNIT_COST_USD.placePhoto;
  return {
    requests: plan.textSearches + plan.placeDetails + photos,
    costUsd: Math.round(costUsd * 1000) / 1000,
  };
}

/** Whether a planned bulk run fits what is left of the monthly budget. */
export function fitsBudget(
  estimate: GoogleCostEstimate,
  monthlyBudgetUsd: number,
  spentThisMonthUsd: number,
): boolean {
  return spentThisMonthUsd + estimate.costUsd <= monthlyBudgetUsd;
}

/** Start of the current calendar month (UTC), the budget window. */
export function startOfBudgetMonth(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Usage contexts that spend the monthly catalog Google budget. Every paid
 * catalog call path (nightly sync, catalog matching, on-demand refresh) must
 * be listed here so the guard counts all of them together. Photos and UI Kit
 * are not money budgets: they have USD 0 request caps of their own.
 */
export const GOOGLE_BUDGET_CONTEXTS = [
  'external-sync',
  'external-sync-search',
  'catalog-match',
  'catalog-match-pro',
  'place-refresh',
] as const satisfies readonly GoogleUsageContext[];

interface UsageCounter {
  countSince(contexts: string[], since: Date): Promise<number>;
}

/** Requests recorded this month per SKU (all contexts billed as that SKU). */
async function requestsBySku(
  usage: UsageCounter,
  now: Date,
): Promise<Map<GoogleSku, number>> {
  const since = startOfBudgetMonth(now);
  const counts = new Map<GoogleSku, number>();
  for (const [context, sku] of Object.entries(GOOGLE_SKU_BY_CONTEXT)) {
    const count = await usage.countSince([context], since);
    counts.set(sku, (counts.get(sku) ?? 0) + count);
  }
  return counts;
}

function billable(sku: GoogleSku, requests: number): number {
  return Math.max(0, requests - trustedFreeRequests(sku));
}

/**
 * Money this month's recorded usage may cost, per SKU, after the trusted
 * share of each free allowance. (`contexts` is kept for callers that only
 * want the catalog paths: their SKUs' usage is counted from every context
 * billed as the same SKU, since Google bills the SKU, not the context.)
 */
export async function spentThisMonthUsd(
  usage: UsageCounter,
  contexts: readonly GoogleUsageContext[],
  now: Date = new Date(),
): Promise<number> {
  const counts = await requestsBySku(usage, now);
  const skus = new Set(
    contexts.map((context) => GOOGLE_SKU_BY_CONTEXT[context]),
  );
  let spent = 0;
  for (const sku of skus) {
    spent += billable(sku, counts.get(sku) ?? 0) * GOOGLE_UNIT_COST_USD[sku];
  }
  return Math.round(spent * 1000) / 1000;
}

/**
 * A running guard for one pass (sync, refresh, catalog matching): it knows
 * this month's usage per SKU and the money left, and `tryCharge` says
 * whether one more request of a SKU fits, free or paid, before it is made.
 */
export class GoogleBudgetTracker {
  private constructor(
    private readonly counts: Map<GoogleSku, number>,
    private remainingUsd: number,
  ) {}

  static async create(
    usage: UsageCounter,
    monthlyBudgetUsd: number,
    now: Date = new Date(),
  ): Promise<GoogleBudgetTracker> {
    const counts = await requestsBySku(usage, now);
    let spent = 0;
    for (const [sku, requests] of counts) {
      if (sku === 'placePhoto' || sku === 'uiKitQuery') continue; // own caps
      spent += billable(sku, requests) * GOOGLE_UNIT_COST_USD[sku];
    }
    return new GoogleBudgetTracker(
      counts,
      Math.max(0, monthlyBudgetUsd - spent),
    );
  }

  /** Money left for paid requests this month. */
  get remaining(): number {
    return Math.round(this.remainingUsd * 1000) / 1000;
  }

  /** Cost one more request of `sku` would add right now (0 while free). */
  marginalCost(sku: GoogleSku): number {
    const used = this.counts.get(sku) ?? 0;
    return used < trustedFreeRequests(sku) ? 0 : GOOGLE_UNIT_COST_USD[sku];
  }

  /** Reserves one request if it fits; false means stop before calling. */
  tryCharge(sku: GoogleSku): boolean {
    const cost = this.marginalCost(sku);
    if (cost > this.remainingUsd + 1e-9) return false;
    this.remainingUsd -= cost;
    this.counts.set(sku, (this.counts.get(sku) ?? 0) + 1);
    return true;
  }

  /** Paid requests this pass may still make for `sku` (estimates). */
  freeLeft(sku: GoogleSku): number {
    return Math.max(0, trustedFreeRequests(sku) - (this.counts.get(sku) ?? 0));
  }
}
