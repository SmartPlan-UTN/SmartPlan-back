/**
 * Conservative per-request cost estimates for Google Maps Platform, used for
 * dry-run estimates and the monthly safety budget. They are deliberately
 * rounded up: the point is to stop an unexpected bulk run, not to reproduce the
 * invoice. Re-check against the Cloud Console pricing before changing budgets.
 *
 * Reference (Places API New, Enterprise tier fields as requested by the sync):
 * Text Search ~US$35/1000, Place Details ~US$20-25/1000, Place Photos ~US$7/1000.
 */
export const GOOGLE_UNIT_COST_USD = {
  textSearch: 0.035,
  placeDetails: 0.025,
  placePhoto: 0.007,
} as const;

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
