import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import { ActivityCategory } from '../activities/entities/activity-category.entity';
import { ActivityPlace } from '../activities/entities/activity-place.entity';
import { Activity } from '../activities/entities/activity.entity';
import { Category } from '../categories/entities/category.entity';
import { assignPrice, normalizePrice } from '../common/pricing/price';
import { City } from '../places/entities/city.entity';
import { Country } from '../places/entities/country.entity';
import { Department } from '../places/entities/department.entity';
import { Place } from '../places/entities/place.entity';
import {
  dropProviderContent,
  syncLinkCoordinates,
} from '../external-integration/google-cache';
import {
  PROMOTABLE_LICENSE_CLASSES,
  type LicenseClass,
} from './catalog.constants';
import { CatalogEligibilityService } from './catalog-eligibility.service';
import {
  canonicalKey,
  findDuplicateCandidates,
  normalizeName,
  type DuplicateSubject,
} from './catalog-dedupe';
import {
  assertNoRestrictedProviderContent,
  canonicalJson,
  sha256,
  validateActivityRecord,
  validatePlaceRecord,
  type ActivityRecord,
  type GeographyRecord,
  type PlaceRecord,
} from './catalog-package';
import { CatalogChangeLog } from './entities/catalog-change-log.entity';
import { CatalogImportBatch } from './entities/catalog-import-batch.entity';
import {
  CatalogStagingRecord,
  type StagingEntityType,
  type StagingRecordStatus,
} from './entities/catalog-staging-record.entity';
import { EntitySourceLink } from './entities/entity-source-link.entity';
import { isHomePlace } from './home-place';

export class QuarantinedSourceError extends Error {}

export interface ImportOptions {
  /** Validate, dedupe and report; write nothing but the staging records. */
  dryRun?: boolean;
  /** Archive entities of this source that the package no longer contains. */
  archiveMissing?: boolean;
  /**
   * Allow `archiveMissing` to archive a large share of the source. Without
   * it, a package that would archive most of the catalog (a truncated file, a
   * wrong source name) is refused.
   */
  allowMassArchive?: boolean;
  /** Apply records flagged as possible duplicates (after human review). */
  acceptDuplicates?: boolean;
  /**
   * Run inside the caller's transaction, so the import and what the caller
   * writes next (a reviewed candidate) commit or roll back together.
   */
  manager?: EntityManager;
}

export interface ImportRecordReport {
  type: StagingEntityType;
  slug: string;
  status: StagingRecordStatus;
  notes: string[];
}

export interface ImportReport {
  batchId: number;
  dryRun: boolean;
  source: string;
  inputHash: string;
  stats: Record<string, number>;
  records: ImportRecordReport[];
}

interface PlaceChange {
  record: PlaceRecord;
  entity: Place | null;
  /** `null` only for the Hogar. */
  departmentId: number | null;
  status: StagingRecordStatus;
  notes: string[];
}

interface ActivityChange {
  record: ActivityRecord;
  entity: Activity | null;
  categoryIds: number[];
  status: StagingRecordStatus;
  notes: string[];
}

const SOURCE_PLACE_ID = 'google-places';

/** Serialises imports: two concurrent runs could otherwise race on slugs. */
const IMPORT_ADVISORY_LOCK = 7_301_001;

/** `archiveMissing` refuses to archive more than this share of a source. */
const MAX_ARCHIVE_SHARE = 0.3;
const MIN_ARCHIVE_GUARD = 5;

export class MassArchiveRefusedError extends Error {}

/**
 * Copies the v2 fields a record carries. A field the record does not carry
 * (a v1 package) keeps its current value, so re-importing an older package
 * never erases occasions tagged later.
 */
export function assignActivityExtras(
  activity: Pick<
    Activity,
    | 'occasions'
    | 'minPeople'
    | 'maxPeople'
    | 'minAge'
    | 'materials'
    | 'rulesRef'
    | 'availableTimesOfDay'
  >,
  record: ActivityRecord,
): void {
  if (record.occasions !== undefined) activity.occasions = record.occasions;
  if (record.minPeople !== undefined) activity.minPeople = record.minPeople;
  if (record.maxPeople !== undefined) activity.maxPeople = record.maxPeople;
  if (record.minAge !== undefined) activity.minAge = record.minAge;
  if (record.materials !== undefined) activity.materials = record.materials;
  if (record.rulesRef !== undefined) activity.rulesRef = record.rulesRef;
  if (record.availableTimesOfDay !== undefined)
    activity.availableTimesOfDay = record.availableTimesOfDay;
}

@Injectable()
export class CatalogImportService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly eligibility: CatalogEligibilityService,
  ) {}

  async import(
    raw: unknown,
    options: ImportOptions = {},
  ): Promise<ImportReport> {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('The catalog package must be a JSON object.');
    }
    // Hard stop before anything is read or written: no restricted provider
    // field may be present anywhere in the package.
    assertNoRestrictedProviderContent(raw);

    const pkg = raw as Record<string, unknown>;
    const source = typeof pkg.source === 'string' ? pkg.source.trim() : '';
    const licenseClass = (
      typeof pkg.licenseClass === 'string' ? pkg.licenseClass : ''
    ) as LicenseClass;
    if (!source) throw new Error('The catalog package needs a "source".');
    if (!PROMOTABLE_LICENSE_CLASSES.includes(licenseClass)) {
      throw new QuarantinedSourceError(
        `Licence class "${licenseClass}" cannot enter the canonical catalog (quarantined until a licensing decision is made).`,
      );
    }

    const inputHash = sha256(canonicalJson(raw));
    const dryRun = options.dryRun === true;

    const outer = options.manager;
    const batchManager = outer ?? this.dataSource.manager;
    const batch = await batchManager.save(
      batchManager.create(CatalogImportBatch, {
        source,
        licenseClass,
        dryRun,
        status: 'running',
        inputHash,
        startedAt: new Date(),
      }),
    );

    try {
      const report = outer
        ? await this.process(outer, batch, pkg, options)
        : await this.dataSource.transaction(async (manager) =>
            this.process(manager, batch, pkg, options),
          );
      await batchManager.update(CatalogImportBatch, batch.id, {
        status: 'completed',
        endedAt: new Date(),
        stats: report.stats,
      });
      return { ...report, inputHash, source, dryRun };
    } catch (error) {
      // Inside the caller's transaction the whole batch rolls back with it.
      if (outer) throw error;
      await this.dataSource.manager.update(CatalogImportBatch, batch.id, {
        status: 'failed',
        endedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async process(
    manager: EntityManager,
    batch: CatalogImportBatch,
    pkg: Record<string, unknown>,
    options: ImportOptions,
  ): Promise<ImportReport> {
    const dryRun = options.dryRun === true;
    await manager.query('SELECT pg_advisory_xact_lock($1)', [
      IMPORT_ADVISORY_LOCK,
    ]);
    const records: ImportRecordReport[] = [];
    const stats: Record<string, number> = {};
    const bump = (key: string) => {
      stats[key] = (stats[key] ?? 0) + 1;
    };

    const geography = this.readGeography(pkg.geography);
    if (!dryRun) await this.upsertGeography(manager, geography);
    // A dry run writes no geography, but the departments the package
    // declares must still count as known so its places can be judged.
    const plannedDepartments = new Set(
      geography.flatMap((entry) =>
        entry.departments.map(
          (department) => `${entry.country}/${entry.city}/${department}`,
        ),
      ),
    );

    // ---- places -------------------------------------------------------
    const rawPlaces = Array.isArray(pkg.places) ? pkg.places : [];
    const placeChanges: PlaceChange[] = [];
    const seenPlaceSlugs = new Set<string>();
    const existingPlaces = await manager.find(Place, {
      relations: { department: true },
    });
    const placeBySlug = new Map<string, Place>();
    const existingSubjects: DuplicateSubject[] = [];
    for (const place of existingPlaces) {
      if (place.slug) {
        placeBySlug.set(place.slug, place);
        if (!isHomePlace(place))
          existingSubjects.push({
            slug: place.slug,
            name: place.name,
            department: place.department?.name ?? '',
            latitude: place.latitude,
            longitude: place.longitude,
            googlePlaceId: place.googlePlaceId ?? null,
          });
      }
    }
    const departmentCache = new Map<string, Department | null>();

    for (const rawPlace of rawPlaces) {
      const { value, errors } = validatePlaceRecord(rawPlace);
      const fallbackSlug =
        typeof (rawPlace as { slug?: unknown })?.slug === 'string'
          ? (rawPlace as { slug: string }).slug
          : `invalid-place-${records.length}`;
      if (!value) {
        await this.stage(
          manager,
          batch,
          'place',
          fallbackSlug,
          rawPlace,
          'rejected',
          errors,
        );
        records.push({
          type: 'place',
          slug: fallbackSlug,
          status: 'rejected',
          notes: errors,
        });
        bump('places.rejected');
        continue;
      }
      if (seenPlaceSlugs.has(value.slug)) {
        const notes = ['duplicate_slug_in_package'];
        await this.stage(
          manager,
          batch,
          'place',
          value.slug,
          value,
          'rejected',
          notes,
        );
        records.push({
          type: 'place',
          slug: value.slug,
          status: 'rejected',
          notes,
        });
        bump('places.rejected');
        continue;
      }
      seenPlaceSlugs.add(value.slug);

      const home = isHomePlace(value);
      const departmentKey = `${value.country}/${value.city}/${value.department}`;
      if (!home && !departmentCache.has(departmentKey)) {
        departmentCache.set(
          departmentKey,
          await this.findDepartment(manager, value),
        );
      }
      let department: { id: number | null } | null = home
        ? { id: null }
        : (departmentCache.get(departmentKey) ?? null);
      if (
        !department &&
        dryRun &&
        plannedDepartments.has(
          `${value.country}/${value.city}/${value.department}`,
        )
      ) {
        department = { id: -1 };
      }
      if (!department) {
        const notes = ['unknown_department'];
        await this.stage(
          manager,
          batch,
          'place',
          value.slug,
          value,
          'rejected',
          notes,
        );
        records.push({
          type: 'place',
          slug: value.slug,
          status: 'rejected',
          notes,
        });
        bump('places.rejected');
        continue;
      }

      const entity = placeBySlug.get(value.slug) ?? null;
      const notes: string[] = [];
      let status: StagingRecordStatus;
      if (!entity && home) {
        // There is a single Hogar (unique index); it is never a duplicate.
        status = 'new';
      } else if (!entity) {
        const duplicates = findDuplicateCandidates(
          {
            slug: value.slug,
            name: value.name,
            department: value.department ?? '',
            latitude: value.latitude,
            longitude: value.longitude,
            googlePlaceId: value.googlePlaceId,
          },
          existingSubjects,
        );
        if (duplicates.length > 0 && !options.acceptDuplicates) {
          notes.push(
            ...duplicates.map((slug) => `possible_duplicate_of:${slug}`),
          );
          status = 'needs_review';
        } else {
          status = 'new';
        }
      } else {
        status = this.samePlace(entity, value, department.id)
          ? 'unchanged'
          : 'updated';
      }
      if (!home && value.latitude === null && !value.googlePlaceId) {
        notes.push('no_coordinates_in_review');
      }

      placeChanges.push({
        record: value,
        entity,
        departmentId: department.id,
        status,
        notes,
      });
      if (!home)
        existingSubjects.push({
          slug: value.slug,
          name: value.name,
          department: value.department ?? '',
          latitude: value.latitude,
          longitude: value.longitude,
          googlePlaceId: value.googlePlaceId,
        });
    }

    // ---- activities ---------------------------------------------------
    const categoryRows = await manager.find(Category, {
      relations: { status: true },
    });
    const categoriesByName = new Map(
      categoryRows
        .filter((category) => category.status?.key === 'active')
        .map((category) => [normalizeName(category.name), category.id]),
    );
    const knownPlaceSlugs = new Set<string>(
      existingPlaces.map((place) => place.slug).filter((s): s is string => !!s),
    );
    for (const change of placeChanges) {
      if (change.status !== 'needs_review')
        knownPlaceSlugs.add(change.record.slug);
    }

    const activityChanges: ActivityChange[] = [];
    const seenActivitySlugs = new Set<string>();
    const rawActivities = Array.isArray(pkg.activities) ? pkg.activities : [];
    // Existing activities are loaded once, not once per record.
    const wantedSlugs = rawActivities
      .map((item) => (item as { slug?: unknown } | null)?.slug)
      .filter((slug): slug is string => typeof slug === 'string');
    const activityBySlug = new Map<string, Activity>(
      wantedSlugs.length === 0
        ? []
        : (
            await manager.find(Activity, {
              where: { slug: In(wantedSlugs) },
              relations: { categories: true, places: { place: true } },
            })
          ).map((activity) => [activity.slug as string, activity]),
    );
    for (const rawActivity of rawActivities) {
      const { value, errors } = validateActivityRecord(rawActivity);
      const fallbackSlug =
        typeof (rawActivity as { slug?: unknown })?.slug === 'string'
          ? (rawActivity as { slug: string }).slug
          : `invalid-activity-${records.length}`;
      const reject = async (
        notes: string[],
        slug: string,
        payload: unknown,
      ) => {
        await this.stage(
          manager,
          batch,
          'activity',
          slug,
          payload,
          'rejected',
          notes,
        );
        records.push({ type: 'activity', slug, status: 'rejected', notes });
        bump('activities.rejected');
      };
      if (!value) {
        await reject(errors, fallbackSlug, rawActivity);
        continue;
      }
      if (seenActivitySlugs.has(value.slug)) {
        await reject(['duplicate_slug_in_package'], value.slug, value);
        continue;
      }
      seenActivitySlugs.add(value.slug);

      const problems: string[] = [];
      const categoryIds: number[] = [];
      for (const name of value.categories) {
        const id = categoriesByName.get(normalizeName(name));
        if (id === undefined) problems.push(`unknown_category:${name}`);
        else categoryIds.push(id);
      }
      for (const slug of value.places) {
        if (!knownPlaceSlugs.has(slug)) problems.push(`unknown_place:${slug}`);
      }
      if (problems.length > 0) {
        await reject(problems, value.slug, value);
        continue;
      }

      const entity = activityBySlug.get(value.slug) ?? null;
      const status: StagingRecordStatus = !entity
        ? 'new'
        : this.sameActivity(entity, value, categoryIds)
          ? 'unchanged'
          : 'updated';
      activityChanges.push({
        record: value,
        entity,
        categoryIds,
        status,
        notes: [],
      });
    }

    // ---- stage + apply -----------------------------------------------
    const touchedActivityIds: number[] = [];
    for (const change of placeChanges) {
      const record = change.record;
      let appliedId: number | null = change.entity?.id ?? null;
      const apply =
        !dryRun && (change.status === 'new' || change.status === 'updated');
      if (apply) {
        appliedId = await this.applyPlace(manager, batch, change);
      }
      await this.stage(
        manager,
        batch,
        'place',
        record.slug,
        record,
        apply ? 'applied' : change.status,
        change.notes,
        appliedId,
      );
      records.push({
        type: 'place',
        slug: record.slug,
        status: apply ? 'applied' : change.status,
        notes: change.notes,
      });
      bump(`places.${change.status}`);
    }

    for (const change of activityChanges) {
      const record = change.record;
      let appliedId: number | null = change.entity?.id ?? null;
      const apply =
        !dryRun && (change.status === 'new' || change.status === 'updated');
      if (apply) {
        appliedId = await this.applyActivity(manager, batch, change);
        touchedActivityIds.push(appliedId);
      }
      await this.stage(
        manager,
        batch,
        'activity',
        record.slug,
        record,
        apply ? 'applied' : change.status,
        change.notes,
        appliedId,
      );
      records.push({
        type: 'activity',
        slug: record.slug,
        status: apply ? 'applied' : change.status,
        notes: change.notes,
      });
      bump(`activities.${change.status}`);
    }

    if (!dryRun && options.archiveMissing) {
      const archived = await this.archiveMissing(
        manager,
        batch,
        seenPlaceSlugs,
        seenActivitySlugs,
        options.allowMassArchive === true,
      );
      stats['places.archived'] = archived.places;
      stats['activities.archived'] = archived.activities;
    }

    if (!dryRun) {
      // Every activity whose places or prices may have changed is re-judged.
      const placeIds = placeChanges
        .filter((c) => c.status === 'new' || c.status === 'updated')
        .map((c) => c.record.slug);
      if (placeIds.length > 0) {
        const links = await manager.find(ActivityPlace, {
          where: { place: { slug: In(placeIds) }, deletedAt: IsNull() },
        });
        touchedActivityIds.push(...links.map((link) => link.idActivity));
      }
      const unique = [...new Set(touchedActivityIds)];
      if (unique.length > 0) {
        await this.eligibility.recompute(unique, manager);
      }
    }

    return {
      batchId: batch.id,
      dryRun,
      source: batch.source,
      inputHash: batch.inputHash ?? '',
      stats,
      records,
    };
  }

  // ------------------------------------------------------------------ geography

  private readGeography(raw: unknown): GeographyRecord[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item) => item as Record<string, unknown>)
      .filter(
        (item) =>
          typeof item?.country === 'string' &&
          typeof item?.city === 'string' &&
          Array.isArray(item?.departments),
      )
      .map((item) => ({
        country: (item.country as string).trim(),
        city: (item.city as string).trim(),
        departments: (item.departments as unknown[])
          .filter((d): d is string => typeof d === 'string')
          .map((d) => d.trim())
          .filter(Boolean),
      }));
  }

  private async upsertGeography(
    manager: EntityManager,
    geography: GeographyRecord[],
  ): Promise<void> {
    for (const entry of geography) {
      let country = await manager.findOne(Country, {
        where: { name: entry.country },
      });
      if (!country) {
        country = await manager.save(
          manager.create(Country, { name: entry.country }),
        );
      }
      let city = await manager.findOne(City, {
        where: { name: entry.city, idCountry: country.id },
      });
      if (!city) {
        city = await manager.save(
          manager.create(City, { name: entry.city, idCountry: country.id }),
        );
      }
      for (const name of entry.departments) {
        const existing = await manager.findOne(Department, {
          where: { name, idCity: city.id },
        });
        if (!existing) {
          await manager.save(
            manager.create(Department, { name, idCity: city.id }),
          );
        }
      }
    }
  }

  private async findDepartment(
    manager: EntityManager,
    record: PlaceRecord,
  ): Promise<Department | null> {
    if (!record.country || !record.city || !record.department) return null;
    const country = await manager.findOne(Country, {
      where: { name: record.country },
    });
    if (!country) return null;
    const city = await manager.findOne(City, {
      where: { name: record.city, idCountry: country.id },
    });
    if (!city) return null;
    return manager.findOne(Department, {
      where: { name: record.department, idCity: city.id },
    });
  }

  // ----------------------------------------------------------------- comparing

  private samePlace(
    entity: Place,
    record: PlaceRecord,
    departmentId: number | null,
  ): boolean {
    return (
      (entity.googlePlaceId ?? null) === (record.googlePlaceId ?? null) &&
      (entity.verifiedAt?.getTime() ?? null) ===
        (record.verifiedAt ? new Date(record.verifiedAt).getTime() : null) &&
      entity.name === record.name &&
      (entity.description ?? null) === (record.description ?? null) &&
      entity.address === record.address &&
      entity.idDepartment === departmentId &&
      // PostgreSQL stores these numeric columns at six decimal places.
      // Publisher precision beyond that must not cause an update every run.
      this.sameCoordinate(entity.latitude, record.latitude) &&
      this.sameCoordinate(entity.longitude, record.longitude) &&
      (entity.kind ?? null) === (record.kind ?? null) &&
      (entity.coordinatesRef ?? null) === (record.coordinatesRef ?? null) &&
      (entity.imageUrl ?? null) === (record.image?.url ?? null) &&
      (entity.imageLicense ?? null) === (record.image?.license ?? null) &&
      (entity.imageAuthor ?? null) === (record.image?.author ?? null) &&
      (entity.imageSourceUrl ?? null) === (record.image?.sourceUrl ?? null) &&
      // A rule change can flip the publication state with no data change.
      (entity.status === 'archived' ||
        entity.status ===
          (record.latitude !== null ||
          record.googlePlaceId ||
          isHomePlace(record)
            ? 'published'
            : 'in_review'))
    );
  }

  /** v2 fields the record carries; an absent field is not a change. */
  private sameExtras(entity: Activity, record: ActivityRecord): boolean {
    const wanted = { ...entity };
    assignActivityExtras(wanted, record);
    return (
      JSON.stringify([
        entity.occasions ?? [],
        entity.minPeople,
        entity.maxPeople,
        entity.minAge,
        entity.materials ?? [],
        entity.rulesRef,
        entity.availableTimesOfDay ?? [],
      ]) ===
      JSON.stringify([
        wanted.occasions ?? [],
        wanted.minPeople,
        wanted.maxPeople,
        wanted.minAge,
        wanted.materials ?? [],
        wanted.rulesRef,
        wanted.availableTimesOfDay ?? [],
      ])
    );
  }

  private sameCoordinate(left: number | null, right: number | null): boolean {
    if (left === null || right === null) return left === right;
    // PostgreSQL rounds decimal ties away from zero; JS toFixed can choose
    // the other side after binary conversion. Half a stored unit is equal.
    return Math.abs(left - right) <= 0.000000500001;
  }

  /**
   * The price a package record asks for. A package never carries user-reported
   * evidence (it is environment-specific), so an UNKNOWN price in the package
   * must not wipe an estimate this environment derived from its own users.
   */
  private incomingPrice(entity: Activity | null, record: ActivityRecord) {
    if (
      entity !== null &&
      record.price.kind === 'UNKNOWN' &&
      entity.priceSource === 'USER_REPORTED'
    ) {
      return normalizePrice({
        priceKind: entity.priceKind,
        priceMin: entity.priceMin,
        priceMax: entity.priceMax,
        priceUnit: entity.priceUnit,
        priceSource: entity.priceSource,
        priceSourceRef: entity.priceSourceRef,
        priceVerifiedAt: entity.priceVerifiedAt,
      });
    }
    return normalizePrice({
      priceKind: record.price.kind,
      priceMin: record.price.min,
      priceMax: record.price.max,
      priceUnit: record.price.unit,
      priceSource: record.price.source,
      priceSourceRef: record.price.sourceRef,
      priceVerifiedAt: record.price.verifiedAt
        ? new Date(record.price.verifiedAt)
        : null,
    });
  }

  private sameActivity(
    entity: Activity,
    record: ActivityRecord,
    categoryIds: number[],
  ): boolean {
    const currentCategories = (entity.categories ?? [])
      .filter((link) => link.deletedAt === null)
      .map((link) => link.idCategory)
      .sort((a, b) => a - b);
    const wantedCategories = [...categoryIds].sort((a, b) => a - b);
    const currentPlaces = (entity.places ?? [])
      .filter((link) => link.deletedAt === null && link.place?.slug)
      .map((link) => link.place.slug as string)
      .sort();
    const wantedPlaces = [...record.places].sort();
    const price = this.incomingPrice(entity, record);
    return (
      (entity.verifiedAt?.getTime() ?? null) ===
        (record.verifiedAt ? new Date(record.verifiedAt).getTime() : null) &&
      entity.name === record.name &&
      entity.description === record.description &&
      entity.estimatedDuration === record.durationMinutes &&
      (record.minPeople === undefined ||
        (entity.minPeople ?? null) === record.minPeople) &&
      (record.maxPeople === undefined ||
        (entity.maxPeople ?? null) === record.maxPeople) &&
      (entity.type ?? null) === (record.type ?? null) &&
      JSON.stringify(entity.availableMonths ?? null) ===
        JSON.stringify(record.availableMonths ?? null) &&
      this.sameExtras(entity, record) &&
      entity.priceKind === price.priceKind &&
      entity.priceMin === price.priceMin &&
      entity.priceMax === price.priceMax &&
      entity.priceUnit === price.priceUnit &&
      entity.priceSource === price.priceSource &&
      (entity.priceSourceRef ?? null) === (price.priceSourceRef ?? null) &&
      (entity.priceVerifiedAt?.getTime() ?? null) ===
        (price.priceVerifiedAt?.getTime() ?? null) &&
      JSON.stringify(currentCategories) === JSON.stringify(wantedCategories) &&
      JSON.stringify(currentPlaces) === JSON.stringify(wantedPlaces)
    );
  }

  // ------------------------------------------------------------------- staging

  private async stage(
    manager: EntityManager,
    batch: CatalogImportBatch,
    entityType: StagingEntityType,
    externalKey: string,
    payload: unknown,
    status: StagingRecordStatus,
    notes: string[],
    appliedEntityId: number | null = null,
  ): Promise<void> {
    // The payload was validated against the allow-list (or is the rejected
    // raw input, itself scanned for restricted keys before the batch began).
    const safe = JSON.parse(JSON.stringify(payload ?? {})) as Record<
      string,
      unknown
    >;
    await manager.save(
      manager.create(CatalogStagingRecord, {
        idBatch: batch.id,
        entityType,
        externalKey: externalKey.slice(0, 160),
        payload: safe,
        payloadHash: sha256(canonicalJson(safe)),
        status,
        notes: notes.length > 0 ? notes : null,
        appliedEntityId,
      }),
    );
  }

  // -------------------------------------------------------------------- apply

  private async applyPlace(
    manager: EntityManager,
    batch: CatalogImportBatch,
    change: PlaceChange,
  ): Promise<number> {
    const { record, departmentId } = change;
    const before = change.entity ? this.placeSnapshot(change.entity) : null;
    const hasCoordinates =
      record.latitude !== null && record.longitude !== null;
    // A place can be located by SmartPlan-owned coordinates or, failing that,
    // by a reviewed Google Place ID: its position is then resolved from the
    // temporary provider cache at runtime. Neither => it waits in review.
    // The Hogar is located at runtime, at the request's starting point.
    const locatable =
      hasCoordinates || Boolean(record.googlePlaceId) || isHomePlace(record);

    const place =
      change.entity ??
      manager.create(Place, { slug: record.slug, status: 'in_review' });
    place.name = record.name;
    place.description = record.description;
    place.address = record.address;
    place.idDepartment = departmentId;
    // Existing places were loaded with department for duplicate matching.
    // Updating only the FK leaves a stale relation that TypeORM writes back.
    place.department =
      departmentId === null
        ? null
        : manager.create(Department, { id: departmentId });
    place.latitude = record.latitude;
    place.longitude = record.longitude;
    place.kind = record.kind;
    place.coordinatesRef = record.coordinatesRef ?? null;
    place.imageUrl = record.image?.url ?? null;
    place.imageLicense = record.image?.license ?? null;
    place.imageAuthor = record.image?.author ?? null;
    place.imageSourceUrl = record.image?.sourceUrl ?? null;
    place.canonicalKey = canonicalKey(
      record.name,
      record.latitude,
      record.longitude,
    );
    place.verifiedAt = record.verifiedAt ? new Date(record.verifiedAt) : null;
    if ((place.googlePlaceId ?? null) !== (record.googlePlaceId ?? null)) {
      // A new identity invalidates whatever was cached for the old one.
      place.googlePlaceId = record.googlePlaceId ?? null;
      dropProviderContent(place);
    }
    // A locatable place is published; any other waits in review. A place an
    // administrator archived stays archived.
    if (place.status !== 'archived') {
      place.status = locatable ? 'published' : 'in_review';
    }
    place.discoverable = place.status === 'published';
    const saved = await manager.save(place);

    await this.link(manager, 'place', saved.id, batch, record.slug);
    if (record.googlePlaceId) {
      await this.link(
        manager,
        'place',
        saved.id,
        {
          source: SOURCE_PLACE_ID,
          licenseClass: 'PROVIDER_ID_ONLY',
        } as CatalogImportBatch,
        record.googlePlaceId,
      );
    }
    await this.log(
      manager,
      batch,
      'place',
      saved.id,
      before ? 'update' : 'create',
      before,
      this.placeSnapshot(saved),
    );
    return saved.id;
  }

  private async applyActivity(
    manager: EntityManager,
    batch: CatalogImportBatch,
    change: ActivityChange,
  ): Promise<number> {
    const { record, categoryIds } = change;
    const before = change.entity ? this.activitySnapshot(change.entity) : null;

    const price = this.incomingPrice(change.entity ?? null, record);

    const activity =
      change.entity ??
      manager.create(Activity, { slug: record.slug, status: 'in_review' });
    activity.name = record.name;
    activity.description = record.description;
    activity.estimatedDuration = record.durationMinutes;
    if (record.minPeople !== undefined) activity.minPeople = record.minPeople;
    if (record.maxPeople !== undefined) activity.maxPeople = record.maxPeople;
    activity.type = record.type;
    activity.availableMonths = record.availableMonths ?? null;
    assignActivityExtras(activity, record);
    activity.verifiedAt = record.verifiedAt
      ? new Date(record.verifiedAt)
      : null;
    assignPrice(activity, price);
    // The import is the curation step: a complete record is published. Whether
    // it may be recommended automatically is the eligibility rules' call.
    if (activity.status !== 'archived') activity.status = 'published';
    const saved = await manager.save(activity);

    // categories
    const current = await manager.find(ActivityCategory, {
      where: { idActivity: saved.id },
    });
    const wanted = new Set(categoryIds);
    const toRemove = current.filter((link) => !wanted.has(link.idCategory));
    if (toRemove.length > 0) await manager.softRemove(toRemove);
    const have = new Set(current.map((link) => link.idCategory));
    for (const idCategory of wanted) {
      if (!have.has(idCategory)) {
        await manager.save(
          manager.create(ActivityCategory, {
            idActivity: saved.id,
            idCategory,
          }),
        );
      }
    }

    // places
    const places = await manager.find(Place, {
      where: { slug: In(record.places) },
    });
    const placeIds = new Set(places.map((place) => place.id));
    const links = await manager.find(ActivityPlace, {
      where: { idActivity: saved.id },
    });
    const stale = links.filter((link) => !placeIds.has(link.idPlace));
    if (stale.length > 0) await manager.softRemove(stale);
    const byPlace = new Map(links.map((link) => [link.idPlace, link]));
    for (const place of places) {
      // A link carries its place's effective coordinates: owned ones, or a
      // copy of the place's temporary provider cache with the same expiry.
      const link =
        byPlace.get(place.id) ??
        manager.create(ActivityPlace, {
          idActivity: saved.id,
          idPlace: place.id,
          latitude: null,
          longitude: null,
          coordinatesSource: null,
        });
      if (syncLinkCoordinates(link, place) || link.id === undefined) {
        await manager.save(link);
      }
    }

    await this.link(manager, 'activity', saved.id, batch, record.slug);
    await this.log(
      manager,
      batch,
      'activity',
      saved.id,
      before ? 'update' : 'create',
      before,
      this.activitySnapshot(saved),
    );
    return saved.id;
  }

  private async archiveMissing(
    manager: EntityManager,
    batch: CatalogImportBatch,
    placeSlugs: Set<string>,
    activitySlugs: Set<string>,
    allowMassArchive = false,
  ): Promise<{ places: number; activities: number }> {
    let places = 0;
    let activities = 0;
    const links = await manager.find(EntitySourceLink, {
      where: { source: batch.source },
    });
    const missing = links.filter((link) =>
      (link.entityType === 'place' ? placeSlugs : activitySlugs).has(
        link.externalId,
      )
        ? false
        : true,
    );
    // Data-loss guard: an empty or truncated package must never archive the
    // catalog it was supposed to describe.
    if (placeSlugs.size === 0 && activitySlugs.size === 0 && links.length > 0) {
      throw new MassArchiveRefusedError(
        'Refusing to archive: the package contains no records.',
      );
    }
    if (
      !allowMassArchive &&
      missing.length > MIN_ARCHIVE_GUARD &&
      missing.length > links.length * MAX_ARCHIVE_SHARE
    ) {
      throw new MassArchiveRefusedError(
        `Refusing to archive ${missing.length} of ${links.length} entities from "${batch.source}". Pass allowMassArchive (--allow-mass-archive) if this is intended.`,
      );
    }
    for (const link of links) {
      const slugs = link.entityType === 'place' ? placeSlugs : activitySlugs;
      if (slugs.has(link.externalId)) continue;
      if (link.entityType === 'place') {
        const place = await manager.findOne(Place, {
          where: { id: link.entityId },
        });
        if (place && place.status !== 'archived') {
          const before = this.placeSnapshot(place);
          place.status = 'archived';
          place.discoverable = false;
          await manager.save(place);
          await this.log(
            manager,
            batch,
            'place',
            place.id,
            'archive',
            before,
            this.placeSnapshot(place),
          );
          places += 1;
        }
      } else {
        const activity = await manager.findOne(Activity, {
          where: { id: link.entityId },
        });
        if (activity && activity.status !== 'archived') {
          const before = this.activitySnapshot(activity);
          activity.status = 'archived';
          activity.discoverable = false;
          activity.planEligible = false;
          activity.autoRecommendEligible = false;
          await manager.save(activity);
          await this.log(
            manager,
            batch,
            'activity',
            activity.id,
            'archive',
            before,
            this.activitySnapshot(activity),
          );
          activities += 1;
        }
      }
    }
    return { places, activities };
  }

  // --------------------------------------------------------------- bookkeeping

  private async link(
    manager: EntityManager,
    entityType: 'place' | 'activity',
    entityId: number,
    batch: Pick<CatalogImportBatch, 'source' | 'licenseClass'>,
    externalId: string,
  ): Promise<void> {
    const existing = await manager.findOne(EntitySourceLink, {
      where: { entityType, source: batch.source, externalId },
    });
    if (existing) {
      existing.entityId = entityId;
      existing.lastSeenAt = new Date();
      await manager.save(existing);
      return;
    }
    await manager.save(
      manager.create(EntitySourceLink, {
        entityType,
        entityId,
        source: batch.source,
        externalId,
        licenseClass: batch.licenseClass,
        lastSeenAt: new Date(),
      }),
    );
  }

  private async log(
    manager: EntityManager,
    batch: CatalogImportBatch,
    entityType: 'place' | 'activity',
    entityId: number,
    operation: 'create' | 'update' | 'archive',
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
  ): Promise<void> {
    await manager.save(
      manager.create(CatalogChangeLog, {
        idBatch: batch.id,
        entityType,
        entityId,
        operation,
        before,
        after,
      }),
    );
  }

  /** Allow-listed canonical fields, safe to keep in the change log. */
  private placeSnapshot(place: Place): Record<string, unknown> {
    return {
      slug: place.slug,
      name: place.name,
      description: place.description,
      address: place.address,
      idDepartment: place.idDepartment,
      latitude: place.latitude,
      longitude: place.longitude,
      kind: place.kind,
      status: place.status,
    };
  }

  private activitySnapshot(activity: Activity): Record<string, unknown> {
    return {
      slug: activity.slug,
      name: activity.name,
      description: activity.description,
      estimatedDuration: activity.estimatedDuration,
      minPeople: activity.minPeople,
      maxPeople: activity.maxPeople,
      type: activity.type,
      status: activity.status,
      priceKind: activity.priceKind,
      priceMin: activity.priceMin,
      priceMax: activity.priceMax,
      priceUnit: activity.priceUnit,
      priceSource: activity.priceSource,
    };
  }
}
