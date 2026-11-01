import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Activity } from '../activities/entities/activity.entity';
import { Place } from '../places/entities/place.entity';
import {
  assertNoRestrictedProviderContent,
  CATALOG_PACKAGE_SCHEMA_VERSION,
  contentHash,
  type ActivityRecord,
  type GeographyRecord,
  type PackageEnvelope,
  type PlaceRecord,
} from './catalog-package';
import { CatalogVersion } from './entities/catalog-version.entity';
import { EntitySourceLink } from './entities/entity-source-link.entity';

const SOURCE_PLACE_ID = 'google-places';

export class PackageIntegrityError extends Error {}

/**
 * Builds the version package: the exact, hashable catalog content that is
 * validated in staging and promoted, unchanged, to production.
 *
 * What it never reads: `activity_place` coordinates, ratings or any other
 * Google cache. Coordinates come only from `place` (SmartPlan-owned) and the
 * only Google value exported is the Place ID, an identity link.
 */
@Injectable()
export class CatalogExportService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async build(): Promise<PackageEnvelope> {
    const manager = this.dataSource.manager;

    const places = await manager.find(Place, {
      where: { status: 'published' },
      relations: { department: { city: { country: true } } },
      order: { slug: 'ASC' },
    });
    const published = places.filter((place) => place.slug !== null);
    const slugById = new Map(
      published.map((place) => [place.id, place.slug as string]),
    );

    const placeIdLinks = await manager.find(EntitySourceLink, {
      where: { entityType: 'place', source: SOURCE_PLACE_ID },
    });
    const googleIdByPlace = new Map(
      placeIdLinks.map((link) => [link.entityId, link.externalId]),
    );

    const placeRecords: PlaceRecord[] = published.map((place) => ({
      slug: place.slug as string,
      name: place.name,
      description: place.description,
      address: place.address,
      country: place.department?.city.country.name ?? null,
      city: place.department?.city.name ?? null,
      department: place.department?.name ?? null,
      latitude: place.latitude,
      longitude: place.longitude,
      kind: place.kind,
      googlePlaceId:
        place.googlePlaceId ?? googleIdByPlace.get(place.id) ?? null,
      verifiedAt: place.verifiedAt ? place.verifiedAt.toISOString() : null,
      sourceRef: null,
      ...(place.coordinatesRef ? { coordinatesRef: place.coordinatesRef } : {}),
      ...(place.imageUrl && place.imageLicense && place.imageSourceUrl
        ? {
            image: {
              url: place.imageUrl,
              license: place.imageLicense,
              author: place.imageAuthor,
              sourceUrl: place.imageSourceUrl,
            },
          }
        : {}),
    }));

    const activities = await manager.find(Activity, {
      where: { status: 'published' },
      relations: {
        categories: { category: { status: true } },
        places: true,
      },
      order: { slug: 'ASC' },
    });
    const activityRecords: ActivityRecord[] = [];
    for (const activity of activities) {
      if (activity.slug === null) continue;
      const placeSlugs = activity.places
        .filter((link) => link.deletedAt === null)
        .map((link) => slugById.get(link.idPlace))
        .filter((slug): slug is string => slug !== undefined);
      const categories = activity.categories
        .filter(
          (link) =>
            link.deletedAt === null && link.category?.status?.key === 'active',
        )
        .map((link) => link.category.name);
      if (placeSlugs.length === 0) continue;
      activityRecords.push({
        slug: activity.slug,
        name: activity.name,
        description: activity.description,
        durationMinutes: activity.estimatedDuration,
        type: activity.type,
        ...(activity.availableMonths
          ? { availableMonths: [...activity.availableMonths] }
          : {}),
        // A v2 snapshot carries cleared values too. Omission is reserved for
        // partial/legacy imports, which intentionally preserve target fields.
        occasions: [...(activity.occasions ?? [])].sort(),
        minPeople: activity.minPeople ?? null,
        maxPeople: activity.maxPeople ?? null,
        minAge: activity.minAge ?? null,
        materials: [...(activity.materials ?? [])],
        rulesRef: activity.rulesRef ?? null,
        availableTimesOfDay: [...(activity.availableTimesOfDay ?? [])],
        categories,
        places: placeSlugs,
        // User-reported estimates belong to the environment that collected
        // them: a version package carries curated and official evidence only.
        price:
          activity.priceSource === 'USER_REPORTED'
            ? {
                kind: 'UNKNOWN',
                min: null,
                max: null,
                unit: null,
                source: null,
                sourceRef: null,
                verifiedAt: null,
              }
            : {
                kind: activity.priceKind,
                min: activity.priceMin,
                max: activity.priceMax,
                unit: activity.priceUnit,
                source: activity.priceSource,
                sourceRef: activity.priceSourceRef,
                verifiedAt: activity.priceVerifiedAt
                  ? activity.priceVerifiedAt.toISOString()
                  : null,
              },
        verifiedAt: activity.verifiedAt
          ? activity.verifiedAt.toISOString()
          : null,
      });
    }

    const geography = this.geographyOf(placeRecords);
    const envelope: PackageEnvelope = {
      schemaVersion: CATALOG_PACKAGE_SCHEMA_VERSION,
      source: 'smartplan-catalog',
      licenseClass: 'OWNED',
      geography,
      places: placeRecords,
      activities: activityRecords,
    };
    // Last line of defence: a package that carries restricted provider
    // content is never produced, whatever put it there.
    assertNoRestrictedProviderContent(envelope);
    return envelope;
  }

  /** Builds the package and records it as a new catalog version. */
  async createVersion(
    name: string,
    notes: string | null = null,
  ): Promise<{ version: CatalogVersion; envelope: PackageEnvelope }> {
    const envelope = await this.build();
    const hash = contentHash(envelope);
    const counts = {
      places: envelope.places.length,
      activities: envelope.activities.length,
    };

    const latest = await this.dataSource.manager.find(CatalogVersion, {
      order: { number: 'DESC' },
      take: 1,
    });
    const previous = latest[0] ?? null;
    if (previous && previous.contentHash === hash) {
      // Nothing changed since the last version: reuse it instead of minting
      // an identical one.
      envelope.manifest = {
        version: previous.number,
        contentHash: hash,
        createdAt: previous.createdAt.toISOString(),
        counts,
      };
      return { version: previous, envelope };
    }

    const version = await this.dataSource.manager.save(
      this.dataSource.manager.create(CatalogVersion, {
        number: (previous?.number ?? 0) + 1,
        name,
        status: 'validated',
        contentHash: hash,
        counts,
        parentNumber: previous?.number ?? null,
        notes,
      }),
    );
    envelope.manifest = {
      version: version.number,
      contentHash: hash,
      createdAt: version.createdAt.toISOString(),
      counts,
    };
    return { version, envelope };
  }

  /** Throws unless the package is intact and carries no restricted content. */
  verify(envelope: PackageEnvelope): string {
    assertNoRestrictedProviderContent(envelope);
    const hash = contentHash(envelope);
    const declared = envelope.manifest?.contentHash;
    if (declared && declared !== hash) {
      throw new PackageIntegrityError(
        `Package content hash mismatch: manifest says ${declared}, content is ${hash}.`,
      );
    }
    return hash;
  }

  private geographyOf(places: PlaceRecord[]): GeographyRecord[] {
    const grouped = new Map<string, GeographyRecord>();
    for (const place of places) {
      // The Hogar has no geography to declare.
      if (!place.country || !place.city || !place.department) continue;
      const key = `${place.country}/${place.city}`;
      const entry = grouped.get(key) ?? {
        country: place.country,
        city: place.city,
        departments: [],
      };
      if (!entry.departments.includes(place.department)) {
        entry.departments.push(place.department);
      }
      grouped.set(key, entry);
    }
    return [...grouped.values()].map((entry) => ({
      ...entry,
      departments: entry.departments.sort(),
    }));
  }
}
