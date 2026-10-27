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
 *   a real place to go to). A place it is tied to must have SmartPlan-owned
 *   coordinates (a temporary provider coordinate is enrichment, not the
 *   foundation of a plan) and must not be known to be permanently closed. An
 *   unknown price is allowed here: it is shown as unpriced and flagged in the
 *   totals, never as free.
 * - AUTO_RECOMMEND_ELIGIBLE: trustworthy enough to be picked automatically
 *   (generation, assistant, surprise): a known, sufficiently trusted and not
 *   stale price, a located place, in season when it is seasonal, and at least
 *   one occasion, so the occasion filter never lets an unclassified activity
 *   through (#135).
 *
 * The virtual Hogar is a location like any other here, always located and
 * open: plan generation puts it at the request's starting point. A curated
 * FREE game played only there has no third party to change its price, so it
 * never goes stale; a FREE museum still does.
 *
 * Pure functions: no database, so every rule is unit-testable.
 */

export interface EligibilityInput {
  status: CatalogStatus;
  name: string;
  description: string | null;
  estimatedDuration: number | null;
  price: Pick<PriceFields, 'priceKind' | 'priceSource' | 'priceVerifiedAt'> &
    Partial<Pick<PriceFields, 'priceSourceRef'>>;
  /** Occasion keys; none means it is never picked automatically. */
  occasions?: readonly string[];
  activeCategoryCount: number;
  /** Months (1-12) the activity runs in; null = all year. */
  availableMonths?: number[] | null;
  locations: Array<{
    placePublished: boolean;
    /** Any usable coordinates, owned or a live provider cache. */
    hasCoordinates: boolean;
    /** SmartPlan-owned coordinates (open data, official, manual). */
    hasPersistentCoordinates?: boolean;
    /** The provider last reported the place as permanently closed. */
    closedPermanently?: boolean;
    /** The virtual Hogar: located at runtime, never closed. */
    virtual?: boolean;
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

/**
 * A curated FREE price with a source, for an activity that only happens at
 * the Hogar: nobody can change it, so it does not expire.
 */
export function isEvergreenHomePrice(
  price: EligibilityInput['price'],
  locations: EligibilityInput['locations'],
): boolean {
  return (
    price.priceKind === 'FREE' &&
    price.priceSource === 'CURATED' &&
    Boolean(price.priceSourceRef) &&
    locations.length > 0 &&
    locations.every((location) => location.virtual)
  );
}

/** {@link isEvergreenHomePrice} in SQL, for reports over `activity` rows. */
export function evergreenHomePriceSql(activity: string): string {
  return `(${activity}.price_kind = 'FREE' AND ${activity}.price_source = 'CURATED'
    AND ${activity}.price_source_ref IS NOT NULL
    AND EXISTS (SELECT 1 FROM activity_place hp
                WHERE hp.id_activity = ${activity}.id AND hp.deleted_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM activity_place rp JOIN place r ON r.id = rp.id_place
                    WHERE rp.id_activity = ${activity}.id AND rp.deleted_at IS NULL
                      AND r.kind IS DISTINCT FROM 'home'))`;
}

/** Whether a seasonal activity runs in `now`'s month (Mendoza time ~ UTC-3). */
export function isInSeason(
  availableMonths: number[] | null | undefined,
  now: Date,
): boolean {
  if (!availableMonths || availableMonths.length === 0) return true;
  const local = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return availableMonths.includes(local.getUTCMonth() + 1);
}

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
  // The Hogar is wherever the user is: always located, never closed.
  const locations = input.locations.map((location) =>
    location.virtual
      ? {
          ...location,
          hasCoordinates: true,
          hasPersistentCoordinates: true,
          closedPermanently: false,
        }
      : location,
  );

  const discoverReasons: string[] = [];
  if (input.status !== 'published') discoverReasons.push('not_published');
  if (!input.name.trim()) discoverReasons.push('no_name');
  const descriptionLength = (input.description ?? '').trim().length;
  if (descriptionLength === 0) discoverReasons.push('no_description');
  const publishedLocations = locations.filter(
    (location) => location.placePublished,
  );
  // An activity that is tied to places, none of which is published, would
  // show up with nowhere to go (and cannot be exported coherently).
  if (locations.length > 0 && publishedLocations.length === 0) {
    discoverReasons.push('place_not_published');
  }
  const discoverable = discoverReasons.length === 0;
  reasons.push(...discoverReasons);

  const planReasons: string[] = [];
  if (!(input.estimatedDuration !== null && input.estimatedDuration > 0)) {
    planReasons.push('no_duration');
  }
  // Activities without places (at home, online) stay plannable; one tied to
  // places needs a real, open place SmartPlan can locate by itself.
  const openLocations = publishedLocations.filter(
    (location) => !location.closedPermanently,
  );
  if (publishedLocations.length > 0 && openLocations.length === 0) {
    planReasons.push('place_closed');
  } else if (
    openLocations.length > 0 &&
    !openLocations.some(
      (location) =>
        location.hasPersistentCoordinates ?? location.hasCoordinates,
    )
  ) {
    planReasons.push('no_persistent_coordinates');
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
      !isEvergreenHomePrice(input.price, locations) &&
      isPriceStale(input.price, opts.now, opts.maxPriceAgeDays)
    ) {
      autoReasons.push('price_stale');
    }
  }
  if (descriptionLength < opts.minDescriptionLength) {
    autoReasons.push('description_too_short');
  }
  if (input.activeCategoryCount < 1) autoReasons.push('no_active_category');
  if (!input.occasions?.length) autoReasons.push('no_occasions');
  if (!isInSeason(input.availableMonths, opts.now)) {
    autoReasons.push('out_of_season');
  }
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
