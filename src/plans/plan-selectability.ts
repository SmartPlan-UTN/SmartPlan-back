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
 * Who may read a plan (CU13): its owner, whatever its kind, or anyone
 * authenticated once its author published it. A private plan is invisible to
 * everyone else, even when they know its id. A cancelled plan is not readable
 * here; its owner still reaches it through "Mis planes".
 */
export function canViewerReadPlan(
  plan: PlanAccessFacts,
  viewerUserId: number | null,
): boolean {
  if (viewerUserId === null || plan.statusKey === 'cancelled') return false;
  if (plan.ownerId === viewerUserId) return true;
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
