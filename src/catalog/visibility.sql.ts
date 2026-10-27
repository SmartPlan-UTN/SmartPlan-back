import { HOME_PLACE_KIND } from './home-place';

/**
 * A published place is shown (Explore, the map, `GET /places`) only while it
 * has at least one approved activity; until then it stays hidden, never
 * deleted, and `catalog report` lists it as debt. The on-demand self-guided
 * visit (#146) does not count: it can be created for any place, so it would
 * make every place visible again.
 */
export function placeHasApprovedActivitySql(place: string): string {
  return `EXISTS (
    SELECT 1 FROM activity_place vap
    JOIN activity va ON va.id = vap.id_activity
    WHERE vap.id_place = ${place}.id AND vap.deleted_at IS NULL
      AND va.deleted_at IS NULL AND va.status = 'published' AND va.discoverable
      AND va.type IS DISTINCT FROM 'self_guided_visit'
  )`;
}

/** A real place that may be listed: published, discoverable, with activities. */
export function visiblePlaceSql(place: string): string {
  return `(${place}.status = 'published' AND ${place}.discoverable
    AND ${place}.deleted_at IS NULL
    AND ${place}.kind IS DISTINCT FROM '${HOME_PLACE_KIND}'
    AND ${placeHasApprovedActivitySql(place)})`;
}
