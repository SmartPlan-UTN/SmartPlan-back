import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { MediaService } from '../media/media.service';
import { McpActivitiesService } from './mcp-activities.service';
import { McpPlansService } from './mcp-plans.service';
import { McpReferenceService } from './mcp-reference.service';
import {
  activityInputSchema,
  activityLoadOptionsShape,
  imageUploadShape,
  MCP_BULK_MAX_ITEMS,
  planInputSchema,
} from './mcp-schemas';

function json(value: unknown, isError = false): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

async function guarded(run: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return json(await run());
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : String(error) },
      true,
    );
  }
}

/**
 * Builds one MCP server per HTTP request (stateless Streamable HTTP): no
 * session survives between calls, so replicas need no shared state.
 */
@Injectable()
export class McpServerFactory {
  constructor(
    private readonly activities: McpActivitiesService,
    private readonly plans: McpPlansService,
    private readonly reference: McpReferenceService,
    private readonly media: MediaService,
  ) {}

  create(): McpServer {
    const server = new McpServer({ name: 'smartplan', version: '1.0.0' });
    const bulkItems = z
      .array(z.record(z.string(), z.unknown()))
      .min(1)
      .max(MCP_BULK_MAX_ITEMS);

    server.registerTool(
      'list_allowed_values',
      {
        description:
          'Allowed values read from the database: active categories, outing types, loadable plan statuses, visibilities and known geography, plus the activity types and price vocabulary the catalog accepts.',
        inputSchema: {},
      },
      () => guarded(() => this.reference.allowedValues()),
    );

    server.registerTool(
      'create_image_upload',
      {
        description:
          'Returns a signed URL (valid 15 minutes) to PUT one JPEG/PNG/WebP image (max 5 MB) into the SmartPlan bucket, and the objectKey to pass in an activity\'s "images".',
        inputSchema: imageUploadShape,
      },
      ({ contentType, byteSize }) =>
        guarded(() => this.media.createStagedUpload(contentType, byteSize)),
    );

    server.registerTool(
      'upsert_activity',
      {
        description:
          'Creates or updates one activity. The Google Maps place_id is the key: an activity already linked to that place is updated. Send "place" when the place is not yet in SmartPlan.',
        inputSchema: {
          activity: activityInputSchema,
          ...activityLoadOptionsShape,
        },
      },
      ({ activity, licenseClass, dryRun }) =>
        guarded(async () => {
          const [result] = await this.activities.load([activity], {
            licenseClass,
            dryRun,
          });
          return result;
        }),
    );

    server.registerTool(
      'upsert_activities_bulk',
      {
        description: `Creates or updates up to ${MCP_BULK_MAX_ITEMS} activities (same shape as upsert_activity). Each item is reported on its own: an invalid item does not stop the others.`,
        inputSchema: { activities: bulkItems, ...activityLoadOptionsShape },
      },
      ({ activities, licenseClass, dryRun }) =>
        guarded(async () => {
          const results = await this.activities.load(activities, {
            licenseClass,
            dryRun,
          });
          return { summary: summarize(results), results };
        }),
    );

    server.registerTool(
      'upsert_plan',
      {
        description:
          'Creates or updates one plan by its sourceId, with its ORDERED activities (activityId or googlePlaceId). Defaults: status "confirmed" and visibility "private" (draft).',
        inputSchema: { plan: planInputSchema },
      },
      ({ plan }) =>
        guarded(async () => {
          const [result] = await this.plans.load([plan]);
          return result;
        }),
    );

    server.registerTool(
      'upsert_plans_bulk',
      {
        description: `Creates or updates up to ${MCP_BULK_MAX_ITEMS} plans (same shape as upsert_plan). Each plan is its own transaction and is reported on its own.`,
        inputSchema: { plans: bulkItems },
      },
      ({ plans }) =>
        guarded(async () => {
          const results = await this.plans.load(plans);
          return { summary: summarize(results), results };
        }),
    );

    return server;
  }
}

function summarize(results: Array<{ status: string }>): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const result of results)
    summary[result.status] = (summary[result.status] ?? 0) + 1;
  return summary;
}
