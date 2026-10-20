import { PlanKind, PlanVisibility } from './entities/plan.entity';

export type ViewerPlanState = 'selectable' | 'selected' | 'view-only';

/** The fields of a plan that decide who may read it or do it. */
export interface PlanAccessFacts {
  kind: PlanKind;
  visibility: PlanVisibility;
  ownerId: number;
  statusKey: string;
}

/**
 * Who may read a plan (CU13): its owner, whatever its kind, or anyone — even
 * without a session, so a shared link opens — once its author published it. A
 * private plan is invisible to everyone else, even when they know its id. A
 * cancelled plan is not readable here; its owner still reaches it through
 * "Mis planes".
 */
export function canViewerReadPlan(
  plan: PlanAccessFacts,
  viewerUserId: number | null,
): boolean {
  if (plan.statusKey === 'cancelled') return false;
  if (viewerUserId !== null && plan.ownerId === viewerUserId) return true;
  return (
    plan.kind === PlanKind.Authored && plan.visibility === PlanVisibility.Public
  );
}

/**
 * Whether the viewer may choose the plan as an outing (CU22). An outing is
 * already someone's copy, so it is never a source; everything else follows
 * read access: an own plan or result, or another person's published plan.
 */
export function canViewerActOnPlan(
  plan: PlanAccessFacts,
  viewerUserId: number | null,
): boolean {
  return plan.kind !== PlanKind.Outing && canViewerReadPlan(plan, viewerUserId);
}

/**
 * Whether the plan has a community section (#106): only a published plan
 * that is still on. Its outings' shared experiences show there, and their
 * photos are as readable as the plan itself.
 */
export function hasCommunity(
  plan: Pick<PlanAccessFacts, 'kind' | 'visibility' | 'statusKey'>,
): boolean {
  return (
    plan.kind === PlanKind.Authored &&
    plan.visibility === PlanVisibility.Public &&
    plan.statusKey !== 'cancelled'
  );
}

/**
 * What Explorar > Planes lists (CU12, #98): authored plans their author
 * published, unless cancelled. `PlansService.createSearchBuilder` filters
 * with these values and `exploreHiddenCause` explains them, so the search and
 * the administration listing (#160) can't disagree.
 */
export const EXPLORE_LISTING = {
  kind: PlanKind.Authored,
  visibility: PlanVisibility.Public,
  excludedStatusKey: 'cancelled',
} as const;

/** Why Explorar leaves a plan out. */
export enum ExploreHiddenCause {
  Generated = 'generated',
  Outing = 'outing',
  Private = 'private',
  Cancelled = 'cancelled',
}

/** Why Explorar leaves the plan out, or `null` when it lists it. */
export function exploreHiddenCause(
  plan: Pick<PlanAccessFacts, 'kind' | 'visibility' | 'statusKey'>,
): ExploreHiddenCause | null {
  if (plan.kind === PlanKind.Generated) return ExploreHiddenCause.Generated;
  if (plan.kind === PlanKind.Outing) return ExploreHiddenCause.Outing;
  if (plan.visibility !== EXPLORE_LISTING.visibility) {
    return ExploreHiddenCause.Private;
  }
  if (plan.statusKey === EXPLORE_LISTING.excludedStatusKey) {
    return ExploreHiddenCause.Cancelled;
  }
  return null;
}
