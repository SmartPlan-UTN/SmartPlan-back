import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GOOGLE_MAPS_PROVIDER_KEY } from '../../database/seeds/definitions';
import { ExternalDataUsageService } from '../../external-integration/external-data-usage.service';
import {
  GOOGLE_SKU_BY_CONTEXT,
  startOfBudgetMonth,
  trustedFreeRequests,
  type GoogleUsageContext,
} from '../../external-integration/google-cost';
import {
  GoogleMapsClientService,
  GoogleMapsProviderError,
} from '../../external-integration/google-maps/google-maps-client.service';
import type { PlanCandidate } from '../candidate';

export const VERIFY_LOCATION_CONTEXT = 'planning-verify-location';
export const VERIFY_HOURS_CONTEXT = 'planning-verify-hours';

/**
 * Per generation: the last mile for the plan we are about to recommend,
 * never a sweep. Hours (Enterprise, ~1,000 free/month) are verified for at
 * most 3 unresolved stops; positions (Essentials) for at most 6.
 */
export const MAX_LOCATION_VERIFICATIONS = 6;
export const MAX_HOURS_VERIFICATIONS = 3;
/** Hard ceiling of the configurable per-request budget. */
export const MAX_LIVE_CHECKS_CEILING = 5;
/** Default monthly ceiling for hours checks, well below the free allowance. */
export const DEFAULT_HOURS_MONTHLY_CAP = 300;
const VERIFY_TIMEOUT_MS = 4_500;

export interface VerificationOutcome {
  /** Candidates whose facts changed (a copy, the input is not mutated). */
  updated: Map<string, PlanCandidate>;
  locationsVerified: number;
  hoursVerified: number;
  /** Unknown prices resolved from the same live response. */
  pricesVerified: number;
  /** Places verified live that need durable (retained) facts. */
  enrichmentNeeded: { placeId: number; fact: 'COORDINATES' | 'HOURS' }[];
  /** Places the provider reports closed (temporarily or for good). */
  closed: number[];
  skipped: 'disabled' | 'no_allowance' | null;
}

/**
 * Request-scoped live verification of plan finalists (D2, D3).
 *
 * - A finalist with only a Google Place ID gets its real position from Place
 *   Details Essentials (location only).
 * - A finalist whose hours are unknown and whose slot is time-sensitive gets
 *   `currentOpeningHours` (Enterprise).
 *
 * Both are provider content used in memory for this request only: never
 * written to place, plan or trace, never exported. Calls are USD 0: they are
 * made only while the trusted share of the SKU's free monthly allowance
 * remains (shared with every other context billed as that SKU), reserved
 * atomically, and never against the paid catalog budget.
 */
@Injectable()
export class LiveVerificationService {
  private readonly logger = new Logger(LiveVerificationService.name);

  constructor(
    private readonly googleMaps: GoogleMapsClientService,
    private readonly usage: ExternalDataUsageService,
    @Optional() private readonly configuration?: ConfigService,
  ) {}

  /** SmartPlan's own monthly ceiling for hours checks (never above free). */
  private hoursMonthlyCap(): number {
    const value = Number(
      this.configuration?.get('PLANNING_LIVE_HOURS_MONTHLY_CAP') ??
        DEFAULT_HOURS_MONTHLY_CAP,
    );
    return Number.isFinite(value) && value >= 0
      ? Math.floor(value)
      : DEFAULT_HOURS_MONTHLY_CAP;
  }

  /**
   * Live Enterprise checks one request may spend (default 3, at most 5),
   * always inside the monthly cap below the free allowance.
   */
  perRequestBudget(): number {
    const value = Number(
      this.configuration?.get('PLANNING_LIVE_CHECKS_PER_REQUEST') ??
        MAX_HOURS_VERIFICATIONS,
    );
    return Number.isFinite(value) && value >= 0
      ? Math.min(MAX_LIVE_CHECKS_CEILING, Math.floor(value))
      : MAX_HOURS_VERIFICATIONS;
  }

  private enabled(): boolean {
    const value: unknown = this.configuration?.get(
      'PLANNING_LIVE_VERIFICATION_ENABLED',
    );
    return value === true || value === 'true' || value === '1';
  }

  /** Free requests left for a context this month, after every other context of its SKU. */
  private async freeCap(
    context: GoogleUsageContext,
    now: Date,
  ): Promise<number> {
    const sku = GOOGLE_SKU_BY_CONTEXT[context];
    const others = (
      Object.keys(GOOGLE_SKU_BY_CONTEXT) as GoogleUsageContext[]
    ).filter(
      (other) => other !== context && GOOGLE_SKU_BY_CONTEXT[other] === sku,
    );
    const usedElsewhere = others.length
      ? await this.usage.countSince(others, startOfBudgetMonth(now))
      : 0;
    return Math.max(0, trustedFreeRequests(sku) - usedElsewhere);
  }

  private async reserve(
    context: GoogleUsageContext,
    reference: string,
    cap: number,
    now: Date,
  ): Promise<boolean> {
    try {
      return await this.usage.reserveWithinCap(
        GOOGLE_MAPS_PROVIDER_KEY,
        reference,
        context,
        cap,
        startOfBudgetMonth(now),
      );
    } catch (error) {
      this.logger.warn(
        `Live verification reservation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  async verify(
    finalists: { candidate: PlanCandidate; needsHours: boolean }[],
    now: Date = new Date(),
  ): Promise<VerificationOutcome> {
    const outcome: VerificationOutcome = {
      updated: new Map(),
      locationsVerified: 0,
      hoursVerified: 0,
      pricesVerified: 0,
      enrichmentNeeded: [],
      closed: [],
      skipped: null,
    };
    const byPlace = new Map<
      number,
      { candidate: PlanCandidate; needsHours: boolean }
    >();
    for (const finalist of finalists) {
      const known = byPlace.get(finalist.candidate.placeId);
      byPlace.set(finalist.candidate.placeId, {
        candidate: finalist.candidate,
        needsHours: (known?.needsHours ?? false) || finalist.needsHours,
      });
    }
    const needLocation = [...byPlace.values()]
      .filter(
        ({ candidate }) =>
          candidate.location === 'APPROXIMATE' && candidate.googlePlaceId,
      )
      .slice(0, MAX_LOCATION_VERIFICATIONS);
    const needHours = [...byPlace.values()]
      .filter(
        ({ candidate, needsHours }) => needsHours && candidate.googlePlaceId,
      )
      // The caller bounds each round; one call never exceeds the ceiling.
      .slice(0, MAX_LIVE_CHECKS_CEILING);
    if (!needLocation.length && !needHours.length) return outcome;
    if (!this.enabled()) {
      outcome.skipped = 'disabled';
      return outcome;
    }

    const [locationCap, freeHoursCap] = await Promise.all([
      needLocation.length ? this.freeCap(VERIFY_LOCATION_CONTEXT, now) : 0,
      needHours.length ? this.freeCap(VERIFY_HOURS_CONTEXT, now) : 0,
    ]);
    // Zero paid spend: the smaller of what is still free and our own cap.
    const hoursCap = Math.min(freeHoursCap, this.hoursMonthlyCap());
    // The request budget starts after the cap lookups (DB time is not Google time).
    const signal = AbortSignal.timeout(VERIFY_TIMEOUT_MS);
    const positions = new Map<
      number,
      { latitude: number; longitude: number }
    >();
    const hours = new Map<number, [number, number][][]>();
    const prices = new Map<number, { min: number; max: number | null }>();

    await Promise.all([
      ...needLocation.map(async ({ candidate }) => {
        const placeId = candidate.googlePlaceId as string;
        if (
          !(await this.reserve(
            VERIFY_LOCATION_CONTEXT,
            placeId,
            locationCap,
            now,
          ))
        ) {
          outcome.skipped ??= 'no_allowance';
          return;
        }
        try {
          positions.set(
            candidate.placeId,
            await this.googleMaps.getPlaceLocation(placeId, signal),
          );
          outcome.enrichmentNeeded.push({
            placeId: candidate.placeId,
            fact: 'COORDINATES',
          });
        } catch (error) {
          this.note(error);
        }
      }),
      ...needHours.map(async ({ candidate }) => {
        const placeId = candidate.googlePlaceId as string;
        if (
          !(await this.reserve(VERIFY_HOURS_CONTEXT, placeId, hoursCap, now))
        ) {
          outcome.skipped ??= 'no_allowance';
          return;
        }
        try {
          const result = await this.googleMaps.getPlaceCurrentHours(
            placeId,
            signal,
          );
          if (result?.weekly.length)
            hours.set(candidate.placeId, result.weekly);
          // The same Enterprise response carries the published price range.
          if (result?.priceRange && result.priceRange.currency === 'ARS')
            prices.set(candidate.placeId, result.priceRange);
          if (result?.businessStatus && result.businessStatus !== 'OPERATIONAL')
            outcome.closed.push(candidate.placeId);
          outcome.enrichmentNeeded.push({
            placeId: candidate.placeId,
            fact: 'HOURS',
          });
        } catch (error) {
          this.note(error);
        }
      }),
    ]);

    for (const finalist of finalists) {
      const candidate = finalist.candidate;
      const position = positions.get(candidate.placeId);
      const weekly = hours.get(candidate.placeId);
      const range =
        candidate.price.priceKind === 'UNKNOWN'
          ? prices.get(candidate.placeId)
          : undefined;
      if (!position && !weekly && !range) continue;
      outcome.updated.set(candidate.key, {
        ...candidate,
        ...(position
          ? {
              latitude: position.latitude,
              longitude: position.longitude,
              location: 'LIVE' as const,
            }
          : {}),
        ...(weekly
          ? {
              hours: {
                weekly,
                source: 'LIVE_PROVIDER' as const,
                verifiedAt: now,
              },
            }
          : {}),
        ...(range
          ? {
              price: {
                priceKind:
                  range.max === null ? ('FROM' as const) : ('RANGE' as const),
                priceMin: range.min,
                priceMax: range.max,
                priceUnit: 'CONSUMPTION' as const,
                priceCurrency: 'ARS',
                priceSource: 'PROVIDER_HINT' as const,
                priceSourceRef: 'google:priceRange',
                priceVerifiedAt: now,
              },
            }
          : {}),
        ...(outcome.closed.includes(candidate.placeId)
          ? { closedPermanently: true }
          : {}),
      });
    }
    outcome.locationsVerified = positions.size;
    outcome.hoursVerified = hours.size;
    outcome.pricesVerified = prices.size;
    return outcome;
  }

  private note(error: unknown): void {
    if (error instanceof GoogleMapsProviderError && error.reason === 'disabled')
      return;
    this.logger.warn(
      `Live verification failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
