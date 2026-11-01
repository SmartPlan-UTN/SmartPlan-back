import { Inject, Injectable, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { Activity } from '../activities/entities/activity.entity';
import { computeEligibility, type EligibilityOptions } from './eligibility';
import { isHomePlace } from './home-place';

/** Injection token for the environment-level eligibility thresholds. */
export const CATALOG_ELIGIBILITY_DEFAULTS = 'CATALOG_ELIGIBILITY_DEFAULTS';

export interface EligibilityRecomputeResult {
  inspected: number;
  changed: number;
}

/**
 * Applies `computeEligibility` to stored activities. Called when an activity
 * is created or edited, after a catalog import, and by the periodic
 * `catalog:eligibility` task (so a price that went stale stops being used by
 * automatic recommendation without anyone touching the record).
 */
@Injectable()
export class CatalogEligibilityService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional()
    @Inject(CATALOG_ELIGIBILITY_DEFAULTS)
    private readonly defaults: Partial<EligibilityOptions> = {},
  ) {}

  async recompute(
    activityIds?: number[],
    manager: EntityManager = this.dataSource.manager,
    now: Date = new Date(),
  ): Promise<EligibilityRecomputeResult> {
    const activities = await manager.find(Activity, {
      where: activityIds ? { id: In(activityIds) } : {},
      relations: {
        categories: { category: { status: true } },
        places: { place: true },
      },
    });

    let changed = 0;
    for (const activity of activities) {
      const result = computeEligibility(
        {
          status: activity.status,
          name: activity.name,
          description: activity.description,
          estimatedDuration: activity.estimatedDuration,
          price: activity,
          activeCategoryCount: activity.categories.filter(
            (link) => link.category?.status?.key === 'active',
          ).length,
          availableMonths: activity.availableMonths,
          occasions: activity.occasions,
          locations: activity.places
            .filter((link) => link.place && link.deletedAt === null)
            .map((link) => {
              const cacheExpired =
                link.coordinatesSource === 'GOOGLE_CACHE' &&
                link.externalExpiresAt !== null &&
                link.externalExpiresAt.getTime() < now.getTime();
              const linkHasCoordinates =
                link.latitude !== null &&
                link.longitude !== null &&
                !cacheExpired;
              const placeOwned =
                link.place.latitude !== null && link.place.longitude !== null;
              const linkOwned =
                link.coordinatesSource === 'OWNED' &&
                link.latitude !== null &&
                link.longitude !== null;
              return {
                virtual: isHomePlace(link.place),
                placePublished:
                  link.place.status === 'published' && link.place.discoverable,
                hasCoordinates: linkHasCoordinates || placeOwned,
                hasPersistentCoordinates: placeOwned || linkOwned,
                liveResolvable: link.place.googlePlaceId !== null,
                closedPermanently:
                  link.place.externalBusinessStatus === 'CLOSED_PERMANENTLY',
              };
            }),
        },
        { ...this.defaults, now },
      );

      const reasons = result.reasons.length > 0 ? result.reasons : null;
      const same =
        activity.discoverable === result.discoverable &&
        activity.planEligible === result.planEligible &&
        activity.autoRecommendEligible === result.autoRecommendEligible &&
        JSON.stringify(activity.eligibilityReasons ?? null) ===
          JSON.stringify(reasons);
      if (same) continue;

      await manager.update(Activity, activity.id, {
        discoverable: result.discoverable,
        planEligible: result.planEligible,
        autoRecommendEligible: result.autoRecommendEligible,
        eligibilityReasons: reasons,
      });
      changed += 1;
    }

    return { inspected: activities.length, changed };
  }
}
