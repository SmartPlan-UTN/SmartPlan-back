export const EARTH_RADIUS_METERS = 6371000;

/**
 * Builds a SQL expression that computes the great-circle distance, in metres,
 * between a bound point (`:<latParam>`, `:<lngParam>`) and the `latitude` /
 * `longitude` columns of `<alias>`.
 *
 * Both callers pass the point through named parameters so the same query
 * builder can bind them once:
 *
 * - `GeographicResolutionService.nearestDepartment` orders `activity_place`
 *   rows by this expression to find the closest department.
 * - `PlanGenerationService.findCandidateActivities` filters `activity_place`
 *   rows by this expression to honour a surprise request's `maxDistanceKm`.
 *
 * The `LEAST`/`GREATEST` clamp keeps `acos` inside its domain when floating
 * point drift pushes the dot product slightly past ±1.
 */
export function haversineMetersSql(
  alias: string,
  latParam = 'latitude',
  lngParam = 'longitude',
): string {
  return `${EARTH_RADIUS_METERS} * acos(
    LEAST(1, GREATEST(-1,
      cos(radians(:${latParam})) * cos(radians(${alias}.latitude)) *
        cos(radians(${alias}.longitude) - radians(:${lngParam})) +
      sin(radians(:${latParam})) * sin(radians(${alias}.latitude))
    ))
  )`;
}
