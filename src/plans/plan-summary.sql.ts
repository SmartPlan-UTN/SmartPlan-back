import type { PriceCompleteness } from '../common/pricing/price';
import { publicContentSql } from '../common/moderation/content-status';
import { activitySubtypeLabelSql } from '../catalog/taxonomy';

/**
 * Plan listing projections. A stop is an activity (offering) or the
 * intrinsic action of a place (`id_place` + `action`), so every projection
 * reads both: ratings, names, categories, distance and the cover image.
 */
export const PLAN_AVERAGE_RATING_SQL = `
  COALESCE((
    SELECT AVG("planRating"."score")
    FROM "plan_detail" "ratingDetail"
    INNER JOIN "rating" "planRating"
      ON "planRating"."id_activity" = "ratingDetail"."id_activity"
     AND "planRating"."deleted_at" IS NULL
     AND ${publicContentSql('"planRating"."status"')}
    WHERE "ratingDetail"."id_plan" = "plan"."id"
      AND "ratingDetail"."deleted_at" IS NULL
  ), 0)
`;

/** "Cena en Anna Bistró" for a place-action stop, the activity name otherwise. */
export const PLAN_STOP_NAME_SQL = (
  detail: string,
  activity: string,
  place: string,
) => `
  COALESCE(
    ${activity}."name",
    COALESCE(${detail}."estimate_basis"->>'experienceLabel', ${activitySubtypeLabelSql(`${detail}."action"`)})
      || ' en ' || ${place}."name"
  )`;

export const PLAN_ACTIVITY_NAMES_SQL = `
  COALESCE((
    SELECT jsonb_agg(${PLAN_STOP_NAME_SQL('"nameDetail"', '"nameActivity"', '"namePlace"')} ORDER BY "nameDetail"."order")
    FROM "plan_detail" "nameDetail"
    LEFT JOIN "activity" "nameActivity"
      ON "nameActivity"."id" = "nameDetail"."id_activity"
     AND "nameActivity"."deleted_at" IS NULL
    LEFT JOIN "place" "namePlace"
      ON "namePlace"."id" = "nameDetail"."id_place"
     AND "namePlace"."deleted_at" IS NULL
    WHERE "nameDetail"."id_plan" = "plan"."id"
      AND "nameDetail"."deleted_at" IS NULL
      AND ("nameActivity"."id" IS NOT NULL OR "namePlace"."id" IS NOT NULL)
  ), '[]'::jsonb)
`;

export const PLAN_CATEGORY_JSON_SQL = `
  COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object('id', "planCategory"."id", 'name', "planCategory"."name")
      ORDER BY "planCategory"."name", "planCategory"."id"
    )
    FROM (
      SELECT DISTINCT "category"."id", "category"."name"
      FROM "plan_detail" "categoryDetail"
      INNER JOIN "activity_category" "categoryRelation"
        ON "categoryRelation"."id_activity" = "categoryDetail"."id_activity"
       AND "categoryRelation"."deleted_at" IS NULL
      INNER JOIN "category" "category"
        ON "category"."id" = "categoryRelation"."id_category"
       AND "category"."deleted_at" IS NULL
      INNER JOIN "category_status" "categoryStatus"
        ON "categoryStatus"."id" = "category"."id_category_status"
       AND "categoryStatus"."deleted_at" IS NULL
       AND "categoryStatus"."key" = 'active'
      WHERE "categoryDetail"."id_plan" = "plan"."id"
        AND "categoryDetail"."deleted_at" IS NULL
    ) "planCategory"
  ), '[]'::jsonb)
`;

/** Nearest stop: an activity's location, or a place stop's owned position. */
export const PLAN_DISTANCE_SQL = `
  (SELECT MIN(
    6371 * ACOS(LEAST(1, GREATEST(-1,
      COS(RADIANS(:latitude))
      * COS(RADIANS("stopPoint"."latitude"::double precision))
      * COS(RADIANS("stopPoint"."longitude"::double precision) - RADIANS(:longitude))
      + SIN(RADIANS(:latitude))
      * SIN(RADIANS("stopPoint"."latitude"::double precision))
    )))
  )
  FROM (
    SELECT "planPlace"."latitude", "planPlace"."longitude"
    FROM "plan_detail" "distanceDetail"
    INNER JOIN "activity_place" "planPlace"
      ON "planPlace"."id_activity" = "distanceDetail"."id_activity"
     AND "planPlace"."deleted_at" IS NULL
    WHERE "distanceDetail"."id_plan" = "plan"."id"
      AND "distanceDetail"."deleted_at" IS NULL
    UNION ALL
    SELECT "stopPlace"."latitude", "stopPlace"."longitude"
    FROM "plan_detail" "placeDetail"
    INNER JOIN "place" "stopPlace"
      ON "stopPlace"."id" = "placeDetail"."id_place"
     AND "stopPlace"."deleted_at" IS NULL
    WHERE "placeDetail"."id_plan" = "plan"."id"
      AND "placeDetail"."deleted_at" IS NULL
      AND "placeDetail"."id_activity" IS NULL
  ) "stopPoint"
  WHERE "stopPoint"."latitude" IS NOT NULL
    AND "stopPoint"."longitude" IS NOT NULL)
`;

/** The plan cover, or the earliest image in its first pictured stop. */
export const PLAN_IMAGE_URL_SQL = `
  COALESCE(
    (SELECT '/api/media/plan/' || "cover"."id"
       FROM "plan_image" "cover"
      WHERE "cover"."id_plan" = "plan"."id" AND "cover"."deleted_at" IS NULL
      ORDER BY "cover"."is_primary" DESC, "cover"."display_order", "cover"."id"
      LIMIT 1),
    (SELECT '/api/media/activity/' || "activityImage"."id"
       FROM "plan_detail" "imageDetail"
       JOIN "activity_image" "activityImage"
         ON "activityImage"."id_activity" = "imageDetail"."id_activity"
        AND "activityImage"."deleted_at" IS NULL
      WHERE "imageDetail"."id_plan" = "plan"."id"
        AND "imageDetail"."deleted_at" IS NULL
      ORDER BY "imageDetail"."order", "activityImage"."is_primary" DESC,
               "activityImage"."display_order", "activityImage"."id"
      LIMIT 1),
    (SELECT '/api/media/place/' || "placeImage"."id"
       FROM "plan_detail" "placeImageDetail"
       JOIN "place_image" "placeImage"
         ON "placeImage"."id_place" = "placeImageDetail"."id_place"
        AND "placeImage"."deleted_at" IS NULL
      WHERE "placeImageDetail"."id_plan" = "plan"."id"
        AND "placeImageDetail"."deleted_at" IS NULL
      ORDER BY "placeImageDetail"."order", "placeImage"."is_primary" DESC,
               "placeImage"."display_order", "placeImage"."id"
      LIMIT 1),
    (SELECT '/api/activity-places/' || "photoLocation"."id" || '/photo'
       FROM "plan_detail" "photoDetail"
       JOIN "activity_place" "photoLocation" ON "photoLocation"."id_activity" = "photoDetail"."id_activity" AND "photoLocation"."deleted_at" IS NULL
       JOIN "place" "photoPlace" ON "photoPlace"."id" = "photoLocation"."id_place" AND "photoPlace"."deleted_at" IS NULL
       JOIN "activity" "photoActivity" ON "photoActivity"."id" = "photoLocation"."id_activity" AND "photoActivity"."deleted_at" IS NULL
      WHERE "photoDetail"."id_plan" = "plan"."id" AND "photoDetail"."deleted_at" IS NULL
        AND "photoPlace"."google_place_id" IS NOT NULL AND "photoPlace"."status" = 'published' AND "photoPlace"."discoverable" = true
        AND "photoActivity"."status" = 'published' AND "photoActivity"."discoverable" = true
      ORDER BY "photoDetail"."order", "photoLocation"."id" LIMIT 1),
    (SELECT '/api/external-integration/places/' || "stopPhotoPlace"."google_place_id" || '/photo'
       FROM "plan_detail" "stopPhotoDetail"
       JOIN "place" "stopPhotoPlace" ON "stopPhotoPlace"."id" = "stopPhotoDetail"."id_place" AND "stopPhotoPlace"."deleted_at" IS NULL
      WHERE "stopPhotoDetail"."id_plan" = "plan"."id" AND "stopPhotoDetail"."deleted_at" IS NULL
        AND "stopPhotoDetail"."id_activity" IS NULL
        AND "stopPhotoPlace"."google_place_id" IS NOT NULL AND "stopPhotoPlace"."status" = 'published' AND "stopPhotoPlace"."discoverable" = true
      ORDER BY "stopPhotoDetail"."order" LIMIT 1)
  )
`;

/**
 * The viewer's active outing copied from this plan (CU22), or `NULL`. It is
 * what turns "Lo voy a hacer" into "Agregado a Mis salidas".
 */
export const PLAN_ACTIVE_OUTING_ID_SQL = `
  (SELECT "viewerOuting"."id" FROM "plan" "viewerOuting"
    WHERE "viewerOuting"."kind" = 'outing'
      AND "viewerOuting"."id_source_plan" = "plan"."id"
      AND "viewerOuting"."id_user" = CAST(:viewerUserId AS integer)
      AND "viewerOuting"."completed_at" IS NULL
      AND "viewerOuting"."deleted_at" IS NULL
    LIMIT 1)
`;

/**
 * SQL mirror of `canViewerActOnPlan` in `plan-selectability.ts`, plus the
 * active-outing check: `selected` once the viewer has an outing to do from
 * this plan. Requires the `plan` and `status` aliases and `:viewerUserId`.
 */
export const PLAN_VIEWER_STATE_SQL = `
  CASE
    WHEN CAST(:viewerUserId AS integer) IS NULL
      OR "status"."key" = 'cancelled'
      OR "plan"."kind" = 'outing' THEN 'view-only'
    WHEN ${PLAN_ACTIVE_OUTING_ID_SQL} IS NOT NULL THEN 'selected'
    WHEN "plan"."id_user" = CAST(:viewerUserId AS integer)
      OR ("plan"."kind" = 'authored' AND "plan"."visibility" = 'public') THEN 'selectable'
    ELSE 'view-only'
  END
`;

/**
 * SQL mirror of `canViewerReadPlan` in `plan-selectability.ts`: the owner
 * reads any of their plans that is not cancelled, anyone else only a
 * published `authored` one. Requires the `plan` and `status` aliases and
 * `:viewerUserId`.
 */
export const PLAN_READABLE_BY_VIEWER_SQL = `
  (
    "status"."key" <> 'cancelled'
    AND (
      "plan"."id_user" = CAST(:viewerUserId AS integer)
      OR ("plan"."kind" = 'authored' AND "plan"."visibility" = 'public')
    )
  )
`;

export interface PlanSummaryRow {
  id: string;
  title: string;
  description: string | null;
  estimatedTotalCost: string | null;
  estimatedTotalCostMax?: string | null;
  unpricedCount?: string | number;
  priceCompleteness?: PriceCompleteness;
  estimatedTotalDuration: string;
  averageRating: string;
  distanceKm: string | null;
  imageUrl: string | null;
  categories: Array<{ id: number; name: string }>;
  activityNames: string[];
  statusKey: string;
  statusName: string;
  viewerPlanState?: 'selectable' | 'selected' | 'view-only';
  activeOutingId?: string | null;
}
