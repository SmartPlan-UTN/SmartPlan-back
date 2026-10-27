/**
 * The virtual "Hogar": the one place games and free plans at home hang from.
 * It has no department, coordinates or Google identity; plan generation puts
 * it at the request's starting point at runtime (zero travel) and stores
 * nothing about the user. Lists, maps, Google sync, matching and dedupe skip
 * it. Every check goes through these helpers so the rule lives in one place.
 */
export const HOME_PLACE_KIND = 'home';
export const HOME_PLACE_SLUG = 'hogar';
export const HOME_PLACE_NAME = 'En casa / donde estén';

export function isHomePlace(
  place: { kind: string | null } | null | undefined,
): boolean {
  return place?.kind === HOME_PLACE_KIND;
}

/** SQL predicate: `alias` is a real place, not the Hogar. */
export function notHomePlaceSql(alias: string): string {
  return `${alias}."kind" IS DISTINCT FROM '${HOME_PLACE_KIND}'`;
}
