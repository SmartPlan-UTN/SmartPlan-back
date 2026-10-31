import type { EntityManager } from 'typeorm';
import { HOME_PLACE_KIND } from './home-place';
import { directKinds } from './place-actionability';

/**
 * A published place is shown (Explore, the map, `GET /places`) only while
 * there is something to do there: an approved activity of its own, or the
 * intrinsic action of its kind (dinner at a restaurant, a walk in a plaza),
 * which the planner uses without an Activity row. Until then it stays
 * hidden, never deleted, and `catalog report` lists it as debt. The
 * on-demand self-guided visit (#146) does not count: it can be created for
 * any place, so it would make every place visible again.
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

/**
 * There is something to do at the place: the intrinsic action of its kind
 * or an approved activity. Places without it are hidden and are catalog debt.
 */
export function placeIsPlannableSql(place: string): string {
  const direct = directKinds()
    .map((kind) => `'${kind}'`)
    .join(',');
  return `(${place}.kind IN (${direct}) OR ${placeHasApprovedActivitySql(place)})`;
}

/** A real place that may be listed: published, discoverable, plannable. */
export function visiblePlaceSql(place: string): string {
  return `(${place}.status = 'published' AND ${place}.discoverable
    AND ${place}.deleted_at IS NULL
    AND ${place}.kind IS DISTINCT FROM '${HOME_PLACE_KIND}'
    AND ${placeIsPlannableSql(place)})`;
}

/** Whether one place may be shown publicly, by {@link visiblePlaceSql}. */
export async function isPlaceVisible(
  manager: EntityManager,
  placeId: number,
): Promise<boolean> {
  const rows: unknown[] = await manager.query(
    `SELECT 1 FROM place p WHERE p.id = $1 AND ${visiblePlaceSql('p')}`,
    [placeId],
  );
  return rows.length > 0;
}
