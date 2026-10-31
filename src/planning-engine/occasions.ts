/**
 * Catalog occasions in planning (#135): who the plan is for and its mood,
 * matched against what an offering carries in `activity.occasions`.
 *
 * - A who-occasion (romantic, friends, family, kids, solo, big_group) the
 *   request names is required: an offering must carry all of them.
 * - An occasion that clashes with the request excludes an offering that has
 *   none of the requested ones (a park for a date and a birthday stays).
 * - Every requested occasion an offering carries ranks it up.
 *
 * Place actions (a restaurant with no Activity row) and untagged offerings
 * carry no occasions: their fit is read from their traits, never filtered
 * here.
 */
import {
  conflictingOccasions,
  isWhoOccasion,
  type Occasion,
} from '../catalog/taxonomy';
import type { PlanCandidate } from './candidate';
import type { PlanIntent } from './intent/plan-intent';

/** Whether an offering may be planned for the request's occasions. */
export function fitsOccasions(
  candidate: Pick<PlanCandidate, 'occasions'>,
  intent: Pick<PlanIntent, 'occasions'>,
): boolean {
  const tags = candidate.occasions;
  const wanted: readonly Occasion[] = intent.occasions ?? [];
  // An offering nobody tagged yet is no evidence either way (the
  // auto-recommend eligibility already keeps untagged activities out).
  if (!tags?.length || !wanted.length) return true;
  if (
    !wanted.filter(isWhoOccasion).every((occasion) => tags.includes(occasion))
  )
    return false;
  return !(
    conflictingOccasions(wanted).some((occasion) => tags.includes(occasion)) &&
    !wanted.some((occasion) => tags.includes(occasion))
  );
}

/**
 * An offering meant only for children (who: kids or family and kids): not
 * what an unspecified group is looking for.
 */
export function childrenOnly(
  candidate: Pick<PlanCandidate, 'occasions'>,
): boolean {
  // Papa caliente or sillas musicales (kids, family, a big group) are
  // children's games too; a game friends play is not.
  const who = (candidate.occasions ?? []).filter(isWhoOccasion);
  return (
    who.includes('kids') &&
    !who.includes('friends') &&
    !who.includes('romantic')
  );
}

/** Share (0..1) of the requested occasions the offering carries. */
export function occasionMatch(
  candidate: Pick<PlanCandidate, 'occasions'>,
  intent: Pick<PlanIntent, 'occasions'>,
): number {
  const tags = candidate.occasions;
  const wanted = intent.occasions ?? [];
  if (!tags?.length || !wanted.length) return 0;
  return (
    wanted.filter((occasion) => tags.includes(occasion)).length / wanted.length
  );
}

/**
 * A game at home when nobody said who it is for: the group games of a
 * get-together (El impostor, mímica) before Generala or Chinchón.
 */
export function getTogetherGame(
  candidate: Pick<PlanCandidate, 'occasions' | 'location'>,
  intent: Pick<PlanIntent, 'occasions'>,
): boolean {
  return (
    candidate.location === 'HOME' &&
    (candidate.occasions ?? []).includes('party') &&
    !(intent.occasions ?? []).some(isWhoOccasion)
  );
}
