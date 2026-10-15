import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Activity } from '../activities/entities/activity.entity';
import { assignPrice, normalizePrice } from '../common/pricing/price';
import { ActivityPriceHistory } from './entities/activity-price-history.entity';
import { ActivityPriceObservation } from './entities/activity-price-observation.entity';
import {
  estimateFromObservations,
  shouldApplyObservedEstimate,
} from './price-observation';

export const OBSERVED_PRICE_SOURCE_REF = 'smartplan:observed-prices';

export interface ReportedActivityCost {
  activityId: number;
  /** What the person paid for this activity, for their whole party. */
  amount: number;
}

/**
 * Stores per-activity price reports and turns recent ones into the
 * activity's own price when that is warranted.
 *
 * A plan-level total is never an input here: it is stored separately on the
 * feedback and not split across activities. Official/curated evidence that is
 * still current keeps priority (see `shouldApplyObservedEstimate`), and any
 * price this replaces is kept in `activity_price_history`.
 */
@Injectable()
export class ObservedPriceService {
  async record(
    manager: EntityManager,
    input: {
      idFeedback: number;
      partySize: number;
      observedAt: Date;
      costs: ReportedActivityCost[];
    },
  ): Promise<void> {
    const partySize = Math.max(1, input.partySize);
    for (const cost of input.costs) {
      await manager.save(
        manager.create(ActivityPriceObservation, {
          idActivity: cost.activityId,
          idFeedback: input.idFeedback,
          amountReported: cost.amount,
          partySize,
          amountPerPerson: Math.round((cost.amount / partySize) * 100) / 100,
          currency: 'ARS',
          observedAt: input.observedAt,
        }),
      );
    }
  }

  /** Recomputes the estimate for one activity; returns whether it changed. */
  async applyEstimate(
    manager: EntityManager,
    activityId: number,
    now: Date = new Date(),
  ): Promise<boolean> {
    const observations = await manager.find(ActivityPriceObservation, {
      where: { idActivity: activityId },
    });
    const estimate = estimateFromObservations(
      observations.map((o) => ({
        amountPerPerson: Number(o.amountPerPerson),
        observedAt: o.observedAt,
      })),
      { now },
    );
    if (!estimate) return false;

    const activity = await manager.findOne(Activity, {
      where: { id: activityId },
    });
    if (!activity) return false;
    if (!shouldApplyObservedEstimate(activity, estimate, now)) return false;

    const next = normalizePrice({
      priceKind: estimate.kind,
      priceMin: estimate.min,
      priceMax: estimate.kind === 'RANGE' ? estimate.max : estimate.min,
      priceUnit: 'PER_PERSON',
      priceSource: 'USER_REPORTED',
      priceSourceRef: OBSERVED_PRICE_SOURCE_REF,
      priceVerifiedAt: estimate.newestAt,
    });

    const unchanged =
      activity.priceKind === next.priceKind &&
      Number(activity.priceMin) === next.priceMin &&
      Number(activity.priceMax) === next.priceMax &&
      activity.priceSource === 'USER_REPORTED';
    if (unchanged) return false;

    if (activity.priceKind !== 'UNKNOWN') {
      await manager.save(
        manager.create(ActivityPriceHistory, {
          idActivity: activity.id,
          priceKind: activity.priceKind,
          priceMin:
            activity.priceMin === null ? null : String(activity.priceMin),
          priceMax:
            activity.priceMax === null ? null : String(activity.priceMax),
          priceUnit: activity.priceUnit,
          priceSource: activity.priceSource,
          priceSourceRef: activity.priceSourceRef,
          priceVerifiedAt: activity.priceVerifiedAt,
          replacedAt: now,
          reason: 'observed_estimate',
        }),
      );
    }

    assignPrice(activity, next);
    await manager.save(activity);
    return true;
  }
}
