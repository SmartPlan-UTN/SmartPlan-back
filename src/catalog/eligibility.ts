import type { CatalogStatus } from './catalog.constants';
import {
  isPriceStale,
  PRICE_STALE_AFTER_DAYS,
  priceConfidence,
  type PriceConfidence,
  type PriceFields,
} from '../common/pricing/price';

/**
 * Catalog eligibility: what a catalog entry may be USED for, which is a
 * separate question from whether it is published.
 *
 * - DISCOVERABLE: may appear in exploration, search and on the map. It needs a
 *   name and a description; a place and a category are NOT required (an
 *   at-home activity is legitimate), but automatic recommendation needs both,
 *   and a description long enough to say something.
 * - PLAN_ELIGIBLE: a person can meaningfully add it to a plan (duration known,
 *   a real place to go to). An unknown price is allowed here: it is shown as
 *   unpriced and flagged in the totals, never as free.
 * - AUTO_RECOMMEND_ELIGIBLE: trustworthy enough to be picked automatically
 *   (generation, assistant, surprise): a known, sufficiently trusted and not
 *   stale price, and a located place.
 *
 * Pure functions: no database, so every rule is unit-testable.
 */

export interface EligibilityInput {
  status: CatalogStatus;
  name: string;
  description: string | null;
  estimatedDuration: number | null;
  price: Pick<PriceFields, 'priceKind' | 'priceSource' | 'priceVerifiedAt'>;
  activeCategoryCount: number;
  locations: Array<{
    placePublished: boolean;
    hasCoordinates: boolean;
  }>;
}

export interface EligibilityOptions {
  /** Lowest price confidence automatic recommendation accepts. */
  minPriceConfidence: PriceConfidence;
  /**
   * Oldest verified price automatic recommendation accepts. Discovery and the
   * UI still flag a price as stale after PRICE_STALE_AFTER_DAYS: this dial only
   * decides how old a price may be and still be picked automatically (a
   * bootstrap catalog may widen it deliberately, per environment).
   */
  maxPriceAgeDays: number;
  minDescriptionLength: number;
  now: Date;
}

export const DEFAULT_ELIGIBILITY_OPTIONS: EligibilityOptions = {
  // Legacy catalogue prices are LOW confidence. Raise this to MEDIUM or HIGH
  // as prices are curated; it is the single dial for how strict "automatic"
  // is, and is configurable per environment.
  minPriceConfidence: 'LOW',
  maxPriceAgeDays: PRICE_STALE_AFTER_DAYS,
  minDescriptionLength: 20,
  now: new Date(),
};

export interface EligibilityResult {
  discoverable: boolean;
  planEligible: boolean;
  autoRecommendEligible: boolean;
  /** Why a flag is false, as stable machine codes. */
  reasons: string[];
}

const CONFIDENCE_RANK: Record<PriceConfidence, number> = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

export function computeEligibility(
  input: EligibilityInput,
  options: Partial<EligibilityOptions> = {},
): EligibilityResult {
  const opts: EligibilityOptions = {
    ...DEFAULT_ELIGIBILITY_OPTIONS,
    now: new Date(),
    ...options,
  };
  const reasons: string[] = [];

  const discoverReasons: string[] = [];
  if (input.status !== 'published') discoverReasons.push('not_published');
  if (!input.name.trim()) discoverReasons.push('no_name');
  const descriptionLength = (input.description ?? '').trim().length;
  if (descriptionLength === 0) discoverReasons.push('no_description');
  const publishedLocations = input.locations.filter(
    (location) => location.placePublished,
  );
  const discoverable = discoverReasons.length === 0;
  reasons.push(...discoverReasons);

  const planReasons: string[] = [];
  if (!(input.estimatedDuration !== null && input.estimatedDuration > 0)) {
    planReasons.push('no_duration');
  }
  const planEligible = discoverable && planReasons.length === 0;
  reasons.push(...planReasons);

  const autoReasons: string[] = [];
  if (input.price.priceKind === 'UNKNOWN') {
    autoReasons.push('price_unknown');
  } else {
    const confidence = priceConfidence(input.price);
    if (
      CONFIDENCE_RANK[confidence] < CONFIDENCE_RANK[opts.minPriceConfidence]
    ) {
      autoReasons.push('price_confidence_low');
    }
    // A legacy amount was never verified, so it can never be "stale"; every
    // curated or official price must have been verified recently enough.
    if (
      input.price.priceSource !== 'LEGACY' &&
      isPriceStale(input.price, opts.now, opts.maxPriceAgeDays)
    ) {
      autoReasons.push('price_stale');
    }
  }
  if (descriptionLength < opts.minDescriptionLength) {
    autoReasons.push('description_too_short');
  }
  if (input.activeCategoryCount < 1) autoReasons.push('no_active_category');
  if (!publishedLocations.some((location) => location.hasCoordinates)) {
    autoReasons.push('no_coordinates');
  }
  const autoRecommendEligible = planEligible && autoReasons.length === 0;
  reasons.push(...autoReasons);

  return {
    discoverable,
    planEligible,
    autoRecommendEligible,
    reasons: [...new Set(reasons)],
  };
}
