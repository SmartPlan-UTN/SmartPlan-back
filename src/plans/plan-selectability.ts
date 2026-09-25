export type ViewerPlanState = 'selectable' | 'selected' | 'view-only';

/**
 * CU22 is per viewer and independent of ownership or visibility: any
 * authenticated user may record a reversible intention to do a plan. The only
 * gate is the plan's own lifecycle — a `cancelled` plan (and a soft-deleted
 * one, filtered before this check) is closed to new intentions. A `completed`
 * plan keeps the intention; acting on it ("¿hiciste este plan?") is CU23.
 */
export function canViewerActOnPlan(params: {
  viewerUserId: number | null;
  statusKey: string;
}): boolean {
  if (params.viewerUserId === null) {
    return false;
  }
  return params.statusKey !== 'cancelled';
}
