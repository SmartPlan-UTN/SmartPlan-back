import { HttpException, Injectable } from '@nestjs/common';
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
import { assertNoRestrictedProviderContent } from '../catalog/catalog-package';
import { MediaService } from '../media/media.service';
import { Place } from '../places/entities/place.entity';
import { activityInputSchema, type ActivityInput } from './mcp-schemas';
import { McpOwnerService } from './mcp-owner.service';

/** `entity_source_link.source` of everything the MCP loader imports. */
export const MCP_CATALOG_SOURCE = 'mcp';

export type McpItemStatus =
  | 'created'
  | 'updated'
  | 'unchanged'
  | 'needs_review'
  | 'would_create'
  | 'would_update'
  | 'error';

export interface McpImageResult {
  objectKey: string;
  status: 'attached' | 'error';
  imageId?: number;
  error?: string;
}

export interface McpActivityResult {
  index: number;
  googlePlaceId: string | null;
  status: McpItemStatus;
  activityId?: number;
  slug?: string;
  errors: string[];
  images?: McpImageResult[];
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
}

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
    private readonly owner: McpOwnerService,
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

      const place = places.get(input.googlePlaceId) ?? null;
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
      prepared.push({
        index,
        input,
        placeSlug,
        activitySlug: resolved.slug,
        existed: resolved.existed,
      });
    }

    if (prepared.length > 0) {
      results.push(...(await this.importPrepared(prepared, options)));
    }
    return results.sort((left, right) => left.index - right.index);
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
      places: items
        .filter((item) => item.input.place)
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
    const ownerId =
      !dryRun && items.some((item) => item.input.images?.length)
        ? await this.owner.resolveOwnerId()
        : null;

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
      };
      if (item.input.images?.length && activityId && ownerId !== null) {
        result.images = await this.attachImages(
          activityId,
          ownerId,
          item.input.images,
        );
      }
      results.push(result);
    }
    return results;
  }

  private async attachImages(
    activityId: number,
    ownerId: number,
    keys: string[],
  ): Promise<McpImageResult[]> {
    const results: McpImageResult[] = [];
    for (const objectKey of keys) {
      try {
        const image = await this.media.attachStagedImage(
          'activity',
          activityId,
          ownerId,
          objectKey,
        );
        results.push({ objectKey, status: 'attached', imageId: image.id });
      } catch (error) {
        results.push({
          objectKey,
          status: 'error',
          error:
            error instanceof HttpException || error instanceof Error
              ? error.message
              : String(error),
        });
      }
    }
    return results;
  }
}
