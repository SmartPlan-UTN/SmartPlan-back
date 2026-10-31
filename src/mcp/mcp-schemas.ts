import { z } from 'zod';
import { PROMOTABLE_LICENSE_CLASSES } from '../catalog/catalog.constants';
import {
  PRICE_KINDS,
  PRICE_SOURCES,
  PRICE_UNITS,
} from '../common/pricing/price';
import { PlanVisibility } from '../plans/entities/plan.entity';
import { STAGED_IMAGE_TYPES } from '../media/media.service';
import { galleryInputSchema } from './mcp-gallery';

/** Most items one bulk call accepts (keeps a call inside the 100 KB body). */
export const MCP_BULK_MAX_ITEMS = 100;

/** Plan statuses a loaded (authored) plan may take. */
export const MCP_PLAN_STATUSES = [
  'confirmed',
  'completed',
  'cancelled',
] as const;
export type McpPlanStatus = (typeof MCP_PLAN_STATUSES)[number];

export const placeInputSchema = z
  .object({
    name: z.string().min(3).max(150),
    address: z.string().min(1).max(255),
    country: z.string().min(1),
    city: z.string().min(1),
    department: z.string().min(1),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    kind: z.string().nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
  })
  .strict();

export const priceInputSchema = z
  .object({
    kind: z.enum(PRICE_KINDS),
    min: z.number().min(0).nullable().optional(),
    max: z.number().min(0).nullable().optional(),
    unit: z.enum(PRICE_UNITS).nullable().optional(),
    source: z.enum(PRICE_SOURCES).nullable().optional(),
    sourceRef: z.string().url().nullable().optional(),
    verifiedAt: z.string().nullable().optional(),
  })
  .strict();

export const activityInputSchema = z
  .object({
    googlePlaceId: z.string().min(1).max(255),
    name: z.string().min(3).max(150),
    description: z.string().min(1).max(5000),
    durationMinutes: z.number().int().min(1).max(525600),
    categories: z.array(z.string().min(1)).min(1),
    type: z.string().nullable().optional(),
    price: priceInputSchema.nullable().optional(),
    verifiedAt: z.string().nullable().optional(),
    availableMonths: z
      .array(z.number().int().min(1).max(12))
      .nullable()
      .optional(),
    slug: z.string().max(120).optional(),
    place: placeInputSchema.optional(),
    images: galleryInputSchema.optional(),
  })
  .strict();
export type ActivityInput = z.infer<typeof activityInputSchema>;

export const dryRunShape = { dryRun: z.boolean().optional() };

export const activityLoadOptionsShape = {
  licenseClass: z
    .enum(PROMOTABLE_LICENSE_CLASSES as [string, ...string[]])
    .optional(),
  ...dryRunShape,
};

export const planStopSchema = z
  .object({
    activityId: z.number().int().min(1).optional(),
    googlePlaceId: z.string().min(1).max(255).optional(),
  })
  .strict()
  .refine(
    (stop) =>
      (stop.activityId === undefined) !== (stop.googlePlaceId === undefined),
    {
      message: 'Each stop needs exactly one of activityId or googlePlaceId',
    },
  );

export const planInputSchema = z
  .object({
    sourceId: z.string().min(1).max(200),
    title: z.string().min(1).max(150),
    description: z.string().max(2000).nullable().optional(),
    peopleCount: z.number().int().min(1).max(1000),
    status: z.enum(MCP_PLAN_STATUSES).optional(),
    visibility: z
      .enum([PlanVisibility.Private, PlanVisibility.Public])
      .optional(),
    activities: z.array(planStopSchema).min(1).max(50),
    images: galleryInputSchema.optional(),
  })
  .strict();
export type PlanInput = z.infer<typeof planInputSchema>;

export const imageUploadShape = {
  contentType: z.enum(STAGED_IMAGE_TYPES),
  byteSize: z
    .number()
    .int()
    .min(1)
    .max(5 * 1024 * 1024),
};
