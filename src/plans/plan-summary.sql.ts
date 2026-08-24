export const PLAN_AVERAGE_RATING_SQL = `
  COALESCE((
    SELECT AVG("planRating"."score")
    FROM "plan_detail" "ratingDetail"
    INNER JOIN "rating" "planRating"
      ON "planRating"."id_activity" = "ratingDetail"."id_activity"
     AND "planRating"."deleted_at" IS NULL
    WHERE "ratingDetail"."id_plan" = "plan"."id"
      AND "ratingDetail"."deleted_at" IS NULL
  ), 0)
`;

export const PLAN_ACTIVITY_COUNT_SQL = `
  (SELECT COUNT(*)
   FROM "plan_detail" "countDetail"
   WHERE "countDetail"."id_plan" = "plan"."id"
     AND "countDetail"."deleted_at" IS NULL)
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

export const PLAN_DISTANCE_SQL = `
  (SELECT MIN(
    6371 * ACOS(LEAST(1, GREATEST(-1,
      COS(RADIANS(:latitude))
      * COS(RADIANS("planPlace"."latitude"::double precision))
      * COS(RADIANS("planPlace"."longitude"::double precision) - RADIANS(:longitude))
      + SIN(RADIANS(:latitude))
      * SIN(RADIANS("planPlace"."latitude"::double precision))
    )))
  )
  FROM "plan_detail" "distanceDetail"
  INNER JOIN "activity_place" "planPlace"
    ON "planPlace"."id_activity" = "distanceDetail"."id_activity"
   AND "planPlace"."deleted_at" IS NULL
  WHERE "distanceDetail"."id_plan" = "plan"."id"
    AND "distanceDetail"."deleted_at" IS NULL
    AND "planPlace"."latitude" IS NOT NULL
    AND "planPlace"."longitude" IS NOT NULL)
`;

export interface PlanSummaryRow {
  id: string;
  title: string;
  description: string | null;
  estimatedTotalCost: string;
  estimatedTotalDuration: string;
  activityCount: string;
  averageRating: string;
  distanceKm: string | null;
  categories: Array<{ id: number; name: string }>;
  statusKey: string;
  statusName: string;
}
