import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In } from 'typeorm';

import { Activity } from '../activities/entities/activity.entity';
import { ActivityPlace } from '../activities/entities/activity-place.entity';
import { ActivityCategory } from '../activities/entities/activity-category.entity';
import { placeSummaryOfEntity } from '../activities/activities.service';
import { categoriesOfPlaceKind } from '../catalog/taxonomy';
import { Category } from '../categories/entities/category.entity';
import { Place } from './entities/place.entity';

/** Creates one reusable, self-guided visit on an explicit user action. */
@Injectable()
export class PlaceVisitsService {
  constructor(private readonly dataSource: DataSource) {}

  async ensureVisit(placeId: number): Promise<{ activityId: number }> {
    return this.dataSource.transaction(async (manager) => {
      // Serialize creation for this place, including simultaneous requests
      // from different users. Never mutate the catalog during a GET.
      const place = await manager.findOne(Place, {
        where: { id: placeId, status: 'published', discoverable: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!place) {
        throw new NotFoundException({
          code: 'PLACE_NOT_FOUND',
          message: 'El lugar solicitado no está disponible',
        });
      }

      const slug = `place-${placeId}-self-guided-visit`;
      const existing = await manager.findOne(Activity, {
        where: { slug },
        withDeleted: true,
        order: { id: 'DESC' },
      });
      if (existing) {
        if (
          existing.deletedAt ||
          existing.status !== 'published' ||
          !existing.discoverable
        ) {
          throw new ConflictException({
            code: 'PLACE_VISIT_UNAVAILABLE',
            message: 'La visita a este lugar no está disponible',
          });
        }
        return { activityId: existing.id };
      }

      const summary = placeSummaryOfEntity(place);
      const hasCoordinates =
        summary?.latitude != null && summary.longitude != null;
      const visit = await manager.save(
        Activity,
        manager.create(Activity, {
          slug,
          name: `Visita a ${place.name}`.slice(0, 150),
          description: `Visita por cuenta propia a ${place.name}. No incluye una actividad guiada ni una reserva. Confirmá horarios, acceso y consumos con el lugar antes de ir. La duración de una hora es orientativa.`,
          type: 'self_guided_visit',
          estimatedDuration: 60,
          estimatedCost: null,
          priceKind: 'UNKNOWN',
          priceMin: null,
          priceMax: null,
          priceCurrency: 'ARS',
          priceUnit: 'UNSPECIFIED',
          priceSource: null,
          priceSourceRef: null,
          priceVerifiedAt: null,
          status: 'published',
          discoverable: true,
          planEligible: hasCoordinates,
          autoRecommendEligible: false,
          eligibilityReasons: [
            'self_guided_visit',
            'unknown_price',
            ...(!hasCoordinates ? ['no_coordinates'] : []),
          ],
          verifiedAt: null,
          costBasis: 'per_party',
        }),
      );
      await manager.save(
        ActivityPlace,
        manager.create(ActivityPlace, {
          idActivity: visit.id,
          idPlace: placeId,
          latitude: summary?.latitude ?? null,
          longitude: summary?.longitude ?? null,
          coordinatesSource: hasCoordinates
            ? summary?.coordinatesOwned
              ? 'OWNED'
              : 'GOOGLE_CACHE'
            : null,
          externalFetchedAt: summary?.coordinatesOwned
            ? null
            : place.externalFetchedAt,
          externalExpiresAt: summary?.coordinatesOwned
            ? null
            : place.externalExpiresAt,
          notes:
            'Visita por cuenta propia. Confirmá horarios y acceso con el lugar.',
        }),
      );
      const names = categoriesOfPlaceKind(place.kind);
      if (names.length) {
        const categories = await manager.find(Category, {
          where: { name: In([...names]), status: { key: 'active' } },
        });
        await manager.save(
          ActivityCategory,
          categories.map((category) =>
            manager.create(ActivityCategory, {
              idActivity: visit.id,
              idCategory: category.id,
            }),
          ),
        );
      }
      return { activityId: visit.id };
    });
  }
}
