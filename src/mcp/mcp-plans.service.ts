import { HttpException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { createHash } from 'crypto';
import { DataSource, In } from 'typeorm';
import { ActivityPlace } from '../activities/entities/activity-place.entity';
import { CreatePlanComposerDto } from '../plans/dto/plan-composer.dto';
import { Plan, PlanKind, PlanVisibility } from '../plans/entities/plan.entity';
import { PlansService } from '../plans/plans.service';
import { Place } from '../places/entities/place.entity';
import { MediaService } from '../media/media.service';
import { replaceGallery, type McpGalleryResult } from './mcp-gallery';
import { McpOwnerService } from './mcp-owner.service';
import { planInputSchema, type PlanInput } from './mcp-schemas';

export interface McpPlanResult {
  index: number;
  sourceId: string | null;
  status: 'created' | 'updated' | 'error';
  planId?: number;
  planStatus?: string;
  visibility?: PlanVisibility;
  estimatedTotalCost?: number | null;
  estimatedCostPerPerson?: number | null;
  images?: McpGalleryResult;
  errors: string[];
}

/**
 * The plan's idempotency key is derived from its source id, so loading the
 * same `sourceId` again reuses the composer's retry path: it updates the plan
 * (title, people, visibility, ordered itinerary) instead of creating another.
 * No schema change is needed: `plan.composer_request_id` already exists.
 */
export function requestIdForSource(sourceId: string): string {
  const hex = createHash('sha256').update(`mcp:${sourceId}`).digest('hex');
  // Shape it as an RFC 4122 v5-style UUID (version and variant bits set).
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function describe(error: unknown): string {
  if (error instanceof HttpException) {
    const body = error.getResponse();
    if (typeof body === 'object' && body !== null) {
      const { code, message } = body as { code?: string; message?: unknown };
      const text = Array.isArray(message)
        ? message.map(String).join(', ')
        : typeof message === 'string'
          ? message
          : error.message;
      return code ? `${code}: ${text}` : text;
    }
    return String(body);
  }
  return error instanceof Error ? error.message : String(error);
}

@Injectable()
export class McpPlansService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly plans: PlansService,
    private readonly owner: McpOwnerService,
    private readonly media: MediaService,
  ) {}

  /**
   * Each plan runs in its own transaction (the composer's), so one invalid
   * plan never rolls back the others.
   */
  async load(rawItems: unknown[]): Promise<McpPlanResult[]> {
    const ownerId = await this.owner.resolveOwnerId();
    const results: McpPlanResult[] = [];
    const seen = new Set<string>();
    for (const [index, raw] of rawItems.entries()) {
      const parsed = planInputSchema.safeParse(raw);
      if (!parsed.success) {
        results.push({
          index,
          sourceId: (raw as { sourceId?: string } | null)?.sourceId ?? null,
          status: 'error',
          errors: parsed.error.issues.map(
            (issue) => `${issue.path.join('.') || 'item'}: ${issue.message}`,
          ),
        });
        continue;
      }
      if (seen.has(parsed.data.sourceId)) {
        results.push({
          index,
          sourceId: parsed.data.sourceId,
          status: 'error',
          errors: ['duplicate_source_id_in_batch'],
        });
        continue;
      }
      seen.add(parsed.data.sourceId);
      results.push(await this.loadOne(index, parsed.data, ownerId));
    }
    return results;
  }

  private async loadOne(
    index: number,
    input: PlanInput,
    ownerId: number,
  ): Promise<McpPlanResult> {
    const fail = (errors: string[]): McpPlanResult => ({
      index,
      sourceId: input.sourceId,
      status: 'error',
      errors,
    });
    // Default "borrador": a private plan, visible only to its owner.
    const visibility = input.visibility ?? PlanVisibility.Private;
    const statusKey = input.status ?? 'confirmed';
    if (visibility === PlanVisibility.Public && statusKey === 'cancelled') {
      return fail(['A cancelled plan cannot be public']);
    }

    const resolved = await this.resolveActivityIds(input);
    if ('errors' in resolved) return fail(resolved.errors);

    const requestId = requestIdForSource(input.sourceId);
    const dto = plainToInstance(CreatePlanComposerDto, {
      requestId,
      title: input.title,
      description: input.description ?? null,
      peopleCount: input.peopleCount,
      visibility,
      stops: resolved.ids.map((activityId) => ({ activityId })),
    });
    const validation = await validate(dto, { whitelist: true });
    if (validation.length > 0) {
      return fail(
        validation.flatMap((error) => Object.values(error.constraints ?? {})),
      );
    }

    try {
      const existing = await this.dataSource.manager.findOne(Plan, {
        where: {
          idUser: ownerId,
          kind: PlanKind.Authored,
          composerRequestId: requestId,
        },
        relations: { status: true },
      });
      // The composer only edits `confirmed` plans; a reload of a plan that
      // was completed or cancelled reopens it, applies the data, and then
      // sets the requested status again.
      if (existing && existing.status.key !== 'confirmed') {
        await this.plans.setStatus(ownerId, existing.id, 'confirmed');
      }
      let plan = await this.plans.createFromComposer(ownerId, dto, statusKey);
      if (existing && plan.status.key !== statusKey) {
        plan = await this.plans.setStatus(ownerId, plan.id, statusKey);
      }
      // `images` replaces the gallery; without it the photos are untouched.
      const images = input.images
        ? await replaceGallery(this.media, 'plan', plan.id, input.images)
        : undefined;
      return {
        index,
        sourceId: input.sourceId,
        status: existing ? 'updated' : 'created',
        ...(images ? { images } : {}),
        planId: plan.id,
        planStatus: plan.status.key,
        visibility: plan.visibility,
        estimatedTotalCost: plan.estimatedTotalCost,
        estimatedCostPerPerson: plan.estimatedCostPerPerson,
        errors: [],
      };
    } catch (error) {
      return fail([describe(error)]);
    }
  }

  /** Keeps the itinerary order; a stop is an activity id or a Google place. */
  private async resolveActivityIds(
    input: PlanInput,
  ): Promise<{ ids: number[] } | { errors: string[] }> {
    const placeIds = input.activities
      .map((stop) => stop.googlePlaceId)
      .filter((id): id is string => !!id);
    const byPlaceId = new Map<string, number[]>();
    if (placeIds.length > 0) {
      const places = await this.dataSource.manager.find(Place, {
        where: { googlePlaceId: In(placeIds) },
      });
      const links = places.length
        ? await this.dataSource.manager.find(ActivityPlace, {
            where: { idPlace: In(places.map((place) => place.id)) },
          })
        : [];
      for (const place of places) {
        const ids = links
          .filter(
            (link) => link.idPlace === place.id && link.deletedAt === null,
          )
          .map((link) => link.idActivity);
        byPlaceId.set(place.googlePlaceId as string, [
          ...(byPlaceId.get(place.googlePlaceId as string) ?? []),
          ...ids,
        ]);
      }
    }
    const errors: string[] = [];
    const ids: number[] = [];
    for (const [position, stop] of input.activities.entries()) {
      if (stop.activityId !== undefined) {
        ids.push(stop.activityId);
        continue;
      }
      const matches = [
        ...new Set(byPlaceId.get(stop.googlePlaceId as string) ?? []),
      ];
      if (matches.length === 1) ids.push(matches[0]);
      else if (matches.length === 0)
        errors.push(
          `activities.${position}: no activity for googlePlaceId ${stop.googlePlaceId}`,
        );
      else
        errors.push(
          `activities.${position}: googlePlaceId ${stop.googlePlaceId} matches activities ${matches.join(', ')}; use activityId`,
        );
    }
    return errors.length > 0 ? { errors } : { ids };
  }
}
