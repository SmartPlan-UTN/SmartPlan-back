import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource, In, IsNull } from 'typeorm';
import { ActivityPlace } from '../activities/entities/activity-place.entity';
import { Activity } from '../activities/entities/activity.entity';
import type { LicenseClass } from '../catalog/catalog.constants';
import {
  CatalogImportService,
  type ImportReport,
} from '../catalog/catalog-import.service';
import { distanceMeters, normalizeName } from '../catalog/catalog-dedupe';
import {
  assertNoRestrictedProviderContent,
  validatePlaceRecord,
} from '../catalog/catalog-package';
import { MediaService } from '../media/media.service';
import { Place } from '../places/entities/place.entity';
import { activityInputSchema, type ActivityInput } from './mcp-schemas';
import { replaceGallery, type McpGalleryResult } from './mcp-gallery';

/** `entity_source_link.source` of everything the MCP loader imports. */
export const MCP_CATALOG_SOURCE = 'mcp';

export type McpItemStatus =
  | 'created'
  | 'updated'
  | 'unchanged'
  | 'needs_review'
  | 'would_create'
  | 'would_update'
  | 'linked'
  | 'would_link'
  | 'error';

export interface McpActivityResult {
  index: number;
  googlePlaceId: string | null;
  status: McpItemStatus;
  activityId?: number;
  slug?: string;
  /** Existing place (without a place_id) the Google place_id was linked to. */
  linkedPlaceId?: number;
  errors: string[];
  images?: McpGalleryResult;
}

export interface ActivityLoadOptions {
  licenseClass?: string;
  dryRun?: boolean;
}

interface PreparedItem {
  index: number;
  input: ActivityInput;
  activitySlug: string;
  placeSlug: string;
  existed: boolean;
  /** Set when an existing place without place_id is being linked. */
  link?: { place: Place; record: Record<string, unknown> };
}

/** Whether every token of the shorter name appears in the longer one. */
export function containsTokens(left: string, right: string): boolean {
  const a = left.split(' ').filter(Boolean);
  const b = right.split(' ').filter(Boolean);
  if (a.length === 0 || b.length === 0 || a.length === b.length) return false;
  const [shorter, longer] = a.length < b.length ? [a, b] : [b, a];
  const pool = new Set(longer);
  return shorter.every((token) => pool.has(token));
}

interface LinkCache {
  unlinked?: Array<{
    place: Place;
    names: Set<string>;
    activitySlugs: Set<string>;
  }>;
  /** Places already linked by an earlier item of the same call. */
  used: Set<number>;
}

/** Max distance (meters) between coordinates to link an existing place. */
export const LINK_MAX_DISTANCE_METERS = 300;

/** Lower-case kebab slug the catalog validator accepts. */
export function toSlug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function placeSuffix(googlePlaceId: string): string {
  return createHash('sha256').update(googlePlaceId).digest('hex').slice(0, 10);
}

/**
 * Loads activities for the MCP tools. Every activity is a Google Maps place:
 * the Google `place_id` (already stored in `place.google_place_id`) is the
 * upsert key. Records are turned into a catalog package and handed to
 * `CatalogImportService`, so validation, dedupe, taxonomy, source links,
 * change log and eligibility are exactly the catalog import's.
 */
@Injectable()
export class McpActivitiesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly importer: CatalogImportService,
    private readonly media: MediaService,
  ) {}

  async load(
    rawItems: unknown[],
    options: ActivityLoadOptions = {},
  ): Promise<McpActivityResult[]> {
    const results: McpActivityResult[] = [];
    const prepared: PreparedItem[] = [];
    const seenPlaceIds = new Set<string>();

    const places = new Map<string, Place>();
    const ids = rawItems
      .map((item) => (item as { googlePlaceId?: unknown })?.googlePlaceId)
      .filter((id): id is string => typeof id === 'string');
    if (ids.length > 0) {
      for (const place of await this.dataSource.manager.find(Place, {
        where: { googlePlaceId: In(ids) },
        order: { id: 'ASC' },
      })) {
        if (place.googlePlaceId && !places.has(place.googlePlaceId))
          places.set(place.googlePlaceId, place);
      }
    }

    const linkCache: LinkCache = { used: new Set() };
    for (const [index, raw] of rawItems.entries()) {
      const fail = (errors: string[], googlePlaceId: string | null = null) =>
        results.push({ index, googlePlaceId, status: 'error', errors });
      try {
        assertNoRestrictedProviderContent(raw);
      } catch (error) {
        fail([error instanceof Error ? error.message : 'restricted_content']);
        continue;
      }
      const parsed = activityInputSchema.safeParse(raw);
      if (!parsed.success) {
        fail(
          parsed.error.issues.map(
            (issue) => `${issue.path.join('.') || 'item'}: ${issue.message}`,
          ),
        );
        continue;
      }
      const input = parsed.data;
      if (seenPlaceIds.has(input.googlePlaceId)) {
        fail(['duplicate_google_place_id_in_batch'], input.googlePlaceId);
        continue;
      }
      seenPlaceIds.add(input.googlePlaceId);

      let place = places.get(input.googlePlaceId) ?? null;
      let link: PreparedItem['link'];
      if (!place) {
        const candidate = await this.findLinkCandidate(input, linkCache);
        if ('error' in candidate) {
          fail([candidate.error], input.googlePlaceId);
          continue;
        }
        if (candidate.place) {
          const record = this.linkRecord(candidate.place, input);
          // The importer would reject the record and leave the place_id
          // unstored while the activity still loads; refuse the link instead.
          const { errors } = validatePlaceRecord(record);
          if (errors.length > 0) {
            fail(
              [
                `link_invalid_place: ${candidate.place.slug} (${errors.join(', ')}); fix the place in the catalog first`,
              ],
              input.googlePlaceId,
            );
            continue;
          }
          place = candidate.place;
          link = { place: candidate.place, record };
        }
      }
      if (!place && !input.place) {
        fail(
          ['unknown_google_place: send "place" to create it'],
          input.googlePlaceId,
        );
        continue;
      }
      const placeSlug =
        place?.slug ??
        `${toSlug(input.place?.name ?? input.name)}-${placeSuffix(input.googlePlaceId)}`;
      const resolved = await this.existingActivitySlug(place, input);
      if (resolved.error) {
        fail([resolved.error], input.googlePlaceId);
        continue;
      }
      // Only an item that goes on to import claims the place it links.
      if (link) linkCache.used.add(link.place.id);
      prepared.push({
        index,
        input,
        placeSlug,
        activitySlug: resolved.slug,
        existed: resolved.existed,
        ...(link ? { link } : {}),
      });
    }

    if (prepared.length > 0) {
      results.push(...(await this.importPrepared(prepared, options)));
    }
    return results.sort((left, right) => left.index - right.index);
  }

  /**
   * A place_id SmartPlan does not know yet may belong to a place curated
   * before place_ids were stored (catalog import, admin). It is reused when
   * exactly one place without place_id has an equivalent name (its own or one
   * of its activities', compared with the catalog dedupe normalisation: no
   * accents, case, or stopwords) and is nearby: within
   * LINK_MAX_DISTANCE_METERS when both sides have coordinates, else in the
   * same country, city, and department when the bot sends them.
   * Without a `place` block nothing can confirm the location, so only an
   * explicit `slug` of one of the candidate's activities links it.
   */
  private async findLinkCandidate(
    input: ActivityInput,
    cache: LinkCache,
  ): Promise<{ place: Place | null } | { error: string }> {
    const names = new Set(
      [input.name, input.place?.name]
        .filter((name): name is string => !!name)
        .map((name) => normalizeName(name))
        .filter(Boolean),
    );
    if (names.size === 0) return { place: null };
    const unlinked = (await this.unlinkedPlaces(cache)).filter(
      ({ place }) => !cache.used.has(place.id),
    );
    const located = (place: Place): boolean | null => {
      const geography = [
        [input.place?.country, place.department?.city?.country?.name],
        [input.place?.city, place.department?.city?.name],
        [input.place?.department, place.department?.name],
      ].map(([sent, known]) =>
        sent && known ? normalizeName(sent) === normalizeName(known) : null,
      );
      if (geography.includes(false)) return false;
      const lat = input.place?.latitude;
      const lng = input.place?.longitude;
      if (
        lat != null &&
        lng != null &&
        place.latitude != null &&
        place.longitude != null
      ) {
        return (
          distanceMeters(
            { latitude: lat, longitude: lng },
            { latitude: place.latitude, longitude: place.longitude },
          ) <= LINK_MAX_DISTANCE_METERS
        );
      }
      if (geography.every((match) => match === true)) return true;
      return null; // nothing to compare: unknown
    };
    // Exact (normalised) names win. A name that only contains the other
    // ("Los Toneles" in "Bodega Los Toneles") also counts, but only when the
    // location confirms it.
    const exact = unlinked.filter(
      ({ place, names: known }) =>
        [...known].some((name) => names.has(name)) && located(place) !== false,
    );
    let matches =
      exact.length > 0
        ? exact
        : unlinked.filter(
            ({ place, names: known }) =>
              [...known].some((name) =>
                [...names].some((wanted) => containsTokens(name, wanted)),
              ) && located(place) === true,
          );
    const slug = input.slug;
    if (!input.place) {
      matches = slug
        ? matches.filter(({ activitySlugs }) => activitySlugs.has(slug))
        : [];
    } else if (matches.length > 1 && slug) {
      const bySlug = matches.filter(({ activitySlugs }) =>
        activitySlugs.has(slug),
      );
      if (bySlug.length > 0) matches = bySlug;
    }
    if (matches.length === 0) return { place: null };
    if (matches.length > 1) {
      const candidates = matches
        .map(
          ({ place, activitySlugs }) =>
            `${place.slug} [${[...activitySlugs].join(', ')}]`,
        )
        .join(', ');
      return {
        error: `ambiguous_link: ${matches.length} existing places without place_id match this name (${candidates}); send "place" with coordinates or the existing activity "slug"`,
      };
    }
    return { place: matches[0].place };
  }

  private async unlinkedPlaces(
    cache: LinkCache,
  ): Promise<NonNullable<LinkCache['unlinked']>> {
    if (cache.unlinked) return cache.unlinked;
    const places = (
      await this.dataSource.manager.find(Place, {
        where: { googlePlaceId: IsNull() },
        relations: { department: { city: { country: true } } },
        order: { id: 'ASC' },
      })
    ).filter(
      // Linking publishes the place (it becomes locatable by its place_id).
      // Only places already published, or held in review just for lacking
      // coordinates, may be; drafts and places held for other reasons stay.
      (place) =>
        place.slug &&
        (place.status === 'published' ||
          (place.status === 'in_review' &&
            (place.latitude == null || place.longitude == null))),
    );
    const links = places.length
      ? await this.dataSource.manager.find(ActivityPlace, {
          where: {
            idPlace: In(places.map((place) => place.id)),
            deletedAt: IsNull(),
          },
          relations: { activity: true },
        })
      : [];
    const activitiesByPlace = new Map<number, Activity[]>();
    for (const link of links) {
      if (!link.activity) continue;
      const list = activitiesByPlace.get(link.idPlace) ?? [];
      list.push(link.activity);
      activitiesByPlace.set(link.idPlace, list);
    }
    const result = places.map((place) => {
      const activities = activitiesByPlace.get(place.id) ?? [];
      return {
        place,
        names: new Set(
          [place.name, ...activities.map((activity) => activity.name)].map(
            (name) => normalizeName(name),
          ),
        ),
        activitySlugs: new Set(
          activities
            .map((activity) => activity.slug)
            .filter((slug): slug is string => !!slug),
        ),
      };
    });
    cache.unlinked = result;
    return result;
  }

  /** The existing place as a catalog record, now with the Google place_id. */
  private linkRecord(
    place: Place,
    input: ActivityInput,
  ): Record<string, unknown> {
    const sent = input.place;
    return {
      slug: place.slug,
      name: place.name,
      description: place.description ?? sent?.description ?? null,
      address: place.address,
      country: place.department?.city?.country?.name ?? sent?.country,
      city: place.department?.city?.name ?? sent?.city,
      department: place.department?.name ?? sent?.department,
      latitude: place.latitude ?? sent?.latitude ?? null,
      longitude: place.longitude ?? sent?.longitude ?? null,
      kind: place.kind ?? sent?.kind ?? null,
      googlePlaceId: input.googlePlaceId,
      verifiedAt: place.verifiedAt ? place.verifiedAt.toISOString() : null,
      ...(place.coordinatesRef ? { coordinatesRef: place.coordinatesRef } : {}),
      // The importer replaces the image with this one. An incomplete image
      // is sent as is so validation refuses the link instead of erasing it.
      ...(place.imageUrl || place.imageLicense || place.imageSourceUrl
        ? {
            image: {
              url: place.imageUrl ?? null,
              license: place.imageLicense ?? null,
              author: place.imageAuthor ?? null,
              sourceUrl: place.imageSourceUrl ?? null,
            },
          }
        : {}),
    };
  }

  private async existingActivitySlug(
    place: Place | null,
    input: ActivityInput,
  ): Promise<{ slug: string; existed: boolean; error?: string }> {
    const generated =
      input.slug ?? `${toSlug(input.name)}-${placeSuffix(input.googlePlaceId)}`;
    if (!place) return { slug: generated, existed: false };
    const links = await this.dataSource.manager.find(ActivityPlace, {
      where: { idPlace: place.id, deletedAt: IsNull() },
      relations: { activity: true },
    });
    const activities = links
      .map((link) => link.activity)
      .filter((activity): activity is Activity => !!activity?.slug);
    if (activities.length === 0) return { slug: generated, existed: false };
    if (activities.length === 1)
      return { slug: activities[0].slug as string, existed: true };
    const match = activities.find((activity) => activity.slug === generated);
    if (match) return { slug: generated, existed: true };
    return {
      slug: generated,
      existed: false,
      error: `ambiguous_place: ${activities.length} activities use this place; send the "slug" of the one to update (${activities
        .map((activity) => activity.slug)
        .join(', ')})`,
    };
  }

  private async importPrepared(
    items: PreparedItem[],
    options: ActivityLoadOptions,
  ): Promise<McpActivityResult[]> {
    const dryRun = options.dryRun === true;
    const pkg = {
      source: MCP_CATALOG_SOURCE,
      licenseClass: (options.licenseClass ?? 'OWNED') as LicenseClass,
      places: [
        ...items.flatMap((item) => (item.link ? [item.link.record] : [])),
        ...items
          .filter((item) => item.input.place && !item.link)
          .map((item) => {
            const place = item.input.place!;
            return {
              slug: item.placeSlug,
              name: place.name,
              description: place.description ?? null,
              address: place.address,
              country: place.country,
              city: place.city,
              department: place.department,
              latitude: place.latitude ?? null,
              longitude: place.longitude ?? null,
              kind: place.kind ?? null,
              googlePlaceId: item.input.googlePlaceId,
            };
          }),
      ],
      activities: items.map(({ input, activitySlug, placeSlug }) => ({
        slug: activitySlug,
        name: input.name,
        description: input.description,
        durationMinutes: input.durationMinutes,
        type: input.type ?? null,
        categories: input.categories,
        places: [placeSlug],
        ...(input.price ? { price: input.price } : {}),
        verifiedAt: input.verifiedAt ?? null,
        ...(input.availableMonths
          ? { availableMonths: input.availableMonths }
          : {}),
      })),
    };

    let report: ImportReport;
    try {
      report = await this.importer.import(pkg, {
        dryRun,
        // A place found by its Google place_id is the same place by
        // definition; one sent without a match is new, so the name/geo
        // heuristics must not hold it in review.
        acceptDuplicates: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return items.map((item) => ({
        index: item.index,
        googlePlaceId: item.input.googlePlaceId,
        status: 'error' as const,
        errors: [`import_failed: ${message}`],
      }));
    }

    const placeNotes = new Map(
      report.records
        .filter((record) => record.type === 'place')
        .map((record) => [record.slug, record]),
    );
    const activityRecords = new Map(
      report.records
        .filter((record) => record.type === 'activity')
        .map((record) => [record.slug, record]),
    );
    const saved = dryRun
      ? []
      : await this.dataSource.manager.find(Activity, {
          where: { slug: In(items.map((item) => item.activitySlug)) },
        });
    const idBySlug = new Map(saved.map((a) => [a.slug as string, a.id]));

    const results: McpActivityResult[] = [];
    for (const item of items) {
      const record = activityRecords.get(item.activitySlug);
      const placeRecord = placeNotes.get(item.placeSlug);
      const errors = [
        ...(placeRecord && placeRecord.notes.length > 0
          ? placeRecord.notes.map((note) => `place: ${note}`)
          : []),
        ...(record?.notes ?? []),
      ];
      let status: McpItemStatus;
      if (!record || record.status === 'rejected') status = 'error';
      else if (record.status === 'needs_review') status = 'needs_review';
      else if (item.link && placeRecord?.status === 'rejected')
        status = 'error';
      else if (item.link) status = dryRun ? 'would_link' : 'linked';
      else if (record.status === 'unchanged') status = 'unchanged';
      else if (dryRun) status = item.existed ? 'would_update' : 'would_create';
      else status = item.existed ? 'updated' : 'created';
      if (!record) errors.push('not_processed');
      const activityId = idBySlug.get(item.activitySlug);
      const result: McpActivityResult = {
        index: item.index,
        googlePlaceId: item.input.googlePlaceId,
        status,
        slug: item.activitySlug,
        errors,
        ...(activityId ? { activityId } : {}),
        ...(item.link ? { linkedPlaceId: item.link.place.id } : {}),
      };
      // `images` replaces the gallery; without it the photos are untouched.
      if (item.input.images && activityId && !dryRun && status !== 'error') {
        result.images = await replaceGallery(
          this.media,
          'activity',
          activityId,
          item.input.images,
        );
      }
      results.push(result);
    }
    return results;
  }
}
