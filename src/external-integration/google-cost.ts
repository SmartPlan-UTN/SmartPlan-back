/**
 * Google Maps Platform cost model used by SmartPlan's own guards. It is
 * deliberately conservative (rounded up, free tiers ignored for money) so the
 * application stops a run before the invoice could surprise anyone; billing
 * alerts are never the safety mechanism. Re-check the Cloud Console pricing
 * before changing any number here.
 *
 * Per-request SKU prices (Places API New, 2026 list prices, first tier):
 * - Text Search with rating/price fields (Enterprise): ~US$35 / 1000
 * - Place Details with rating/price fields (Enterprise): ~US$20 / 1000
 * - Place Details "IDs only" (id, photos, attributions): free, unlimited
 * - Place Details Photos (one photo URI): US$7 / 1000, 1,000 free a month
 * - Places UI Kit Query (one element instantiation): US$1 / 1000, 10,000 free
 */
export const GOOGLE_UNIT_COST_USD = {
  textSearch: 0.04,
  placeDetails: 0.025,
  placePhoto: 0.007,
  uiKitQuery: 0.001,
  idsOnly: 0,
} as const;

export type GoogleSku = keyof typeof GOOGLE_UNIT_COST_USD;

/** Free monthly usage Google grants per SKU (project-wide). */
export const GOOGLE_FREE_MONTHLY_REQUESTS: Partial<Record<GoogleSku, number>> =
  {
    placePhoto: 1000,
    uiKitQuery: 10000,
  };

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
  'place-refresh',
] as const satisfies readonly GoogleUsageContext[];

/** Conservative money spent this month by the given contexts, per SKU. */
export async function spentThisMonthUsd(
  usage: { countSince(contexts: string[], since: Date): Promise<number> },
  contexts: readonly GoogleUsageContext[],
  now: Date = new Date(),
): Promise<number> {
  const since = startOfBudgetMonth(now);
  let spent = 0;
  for (const context of contexts) {
    const count = await usage.countSince([context], since);
    spent += count * GOOGLE_UNIT_COST_USD[GOOGLE_SKU_BY_CONTEXT[context]];
  }
  return Math.round(spent * 1000) / 1000;
}
