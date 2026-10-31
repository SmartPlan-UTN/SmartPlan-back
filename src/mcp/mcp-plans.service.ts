import { HttpException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { createHash } from 'crypto';
import { DataSource, In } from 'typeorm';
import { ActivityPlace } from '../activities/entities/activity-place.entity';
import { CreatePlanComposerDto } from '../plans/dto/plan-composer.dto';
import type { PlanCostSummaryDto } from '../plans/dto/owner-plan-response.dto';
import { Plan, PlanVisibility } from '../plans/entities/plan.entity';
import { PlansService } from '../plans/plans.service';
import { Place } from '../places/entities/place.entity';
import {
  planPriceSummary,
  type PriceCompleteness,
} from '../common/pricing/price';
import { MediaService } from '../media/media.service';
import {
  checkGallery,
  replaceGallery,
  type McpGalleryResult,
} from './mcp-gallery';
import { McpOwnerService } from './mcp-owner.service';
import { planInputSchema, type PlanInput } from './mcp-schemas';

export interface McpPlanResult {
  index: number;
  sourceId: string | null;
  status: 'created' | 'updated' | 'would_create' | 'would_update' | 'error';
  planId?: number;
  planStatus?: string;
  visibility?: PlanVisibility;
  estimatedTotalCost?: number | null;
  estimatedTotalCostMax?: number | null;
  estimatedCostPerPerson?: number | null;
  priceCompleteness?: PriceCompleteness;
  unpricedCount?: number;
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

/**
 * Cost the bot sees: the plan totals as stored, the same the web shows. With
 * unpriced stops the total is the known part (0 when the rest is FREE);
 * `priceCompleteness` and `unpricedCount` tell the bot it is partial.
 */
export function mcpPlanCost(
  plan: PlanCostSummaryDto,
): Pick<
  McpPlanResult,
  | 'estimatedTotalCost'
  | 'estimatedTotalCostMax'
  | 'estimatedCostPerPerson'
  | 'priceCompleteness'
  | 'unpricedCount'
> {
  return {
    ...planPriceSummary(plan),
    estimatedCostPerPerson: plan.estimatedCostPerPerson,
  };
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

export interface McpPublishResult {
  planId: number;
  title: string;
  status: 'published' | 'would_publish' | 'error';
  errors: string[];
}

/** UUID version nibble of `requestIdForSource` keys (v5-shaped). */
const MCP_REQUEST_ID_PATTERN = '^[0-9a-f]{8}-[0-9a-f]{4}-5';

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
  async load(
    rawItems: unknown[],
    options: { dryRun?: boolean } = {},
  ): Promise<McpPlanResult[]> {
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
      results.push(
        await this.loadOne(
          index,
          parsed.data,
          ownerId,
          options.dryRun === true,
        ),
      );
    }
    return results;
  }

  private async loadOne(
    index: number,
    input: PlanInput,
    ownerId: number,
    dryRun: boolean,
  ): Promise<McpPlanResult> {
    const fail = (errors: string[]): McpPlanResult => ({
      index,
      sourceId: input.sourceId,
      status: 'error',
      errors,
    });
    // Loaded plans are public by default (they feed Explore); a cancelled
    // plan cannot be public, so it defaults to private.
    const statusKey = input.status ?? 'confirmed';
    const visibility =
      input.visibility ??
      (statusKey === 'cancelled'
        ? PlanVisibility.Private
        : PlanVisibility.Public);
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
      // Dry run: the same load in a rolled-back transaction, so the preview
      // makes the composer's checks and keeps its price snapshots.
      const { plan, existed } = await this.plans.loadFromMcp(
        ownerId,
        dto,
        statusKey,
        { dryRun },
      );
      // `images` replaces the gallery; without it the photos are untouched.
      let images: McpGalleryResult | undefined;
      if (input.images) {
        images = dryRun
          ? await checkGallery(this.media, input.images)
          : await replaceGallery(this.media, 'plan', plan.id, input.images);
      }
      const status = dryRun
        ? existed
          ? 'would_update'
          : 'would_create'
        : existed
          ? 'updated'
          : 'created';
      return {
        index,
        sourceId: input.sourceId,
        status,
        ...(images ? { images } : {}),
        // A would_create id belongs to a rolled-back row.
        ...(status === 'would_create' ? {} : { planId: plan.id }),
        planStatus: plan.status.key,
        visibility: plan.visibility,
        ...mcpPlanCost(plan),
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

  /**
   * Publishes plans the MCP already loaded as private (the old default).
   * Only plans of the MCP owner with an MCP-derived request id, status
   * confirmed or completed, are touched; each goes through
   * `PlansService.setVisibility`, so the web's rules apply (an empty plan or
   * one removed by moderation is reported as an error and left as it was).
   */
  async publishLoaded(
    options: { planIds?: number[]; dryRun?: boolean } = {},
  ): Promise<McpPublishResult[]> {
    const ownerId = await this.owner.resolveOwnerId();
    const query = this.dataSource
      .getRepository(Plan)
      .createQueryBuilder('plan')
      .innerJoin('plan.status', 'status')
      .select(['plan.id', 'plan.title'])
      .where('plan.idUser = :ownerId', { ownerId })
      .andWhere('plan.visibility = :private', {
        private: PlanVisibility.Private,
      })
      .andWhere('status.key IN (:...keys)', {
        keys: ['confirmed', 'completed'],
      })
      .andWhere('plan.composerRequestId::text ~ :pattern', {
        pattern: MCP_REQUEST_ID_PATTERN,
      })
      .orderBy('plan.id', 'ASC');
    if (options.planIds?.length)
      query.andWhere('plan.id IN (:...ids)', { ids: options.planIds });
    const candidates = await query.getMany();
    const results: McpPublishResult[] = [];
    for (const plan of candidates) {
      if (options.dryRun) {
        results.push({
          planId: plan.id,
          title: plan.title,
          status: 'would_publish',
          errors: [],
        });
        continue;
      }
      try {
        await this.plans.setVisibility(ownerId, plan.id, PlanVisibility.Public);
        results.push({
          planId: plan.id,
          title: plan.title,
          status: 'published',
          errors: [],
        });
      } catch (error) {
        results.push({
          planId: plan.id,
          title: plan.title,
          status: 'error',
          errors: [describe(error)],
        });
      }
    }
    return results;
  }
}
