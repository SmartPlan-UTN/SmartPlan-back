export type PlanReadinessStage =
  | 'SUGGESTED'
  | 'FEASIBLE'
  | 'VERIFIED'
  | 'PREPARATION_REQUIRED'
  | 'READY';

export type PlanPreparationKind = 'TICKET' | 'RESERVATION';

export interface PlanPreparationTaskDto {
  detailId: number;
  kind: PlanPreparationKind;
  /** A required task keeps the outing from being `READY` until confirmed. */
  required: boolean;
  label: string;
  /** `CONFIRMED` only when the person said so; a link never confirms. */
  status: 'PENDING' | 'CONFIRMED';
  confirmedAt: Date | null;
  /** Official page to act on, never a purchase made by SmartPlan. */
  actionUrl: string | null;
  actionLabel: string | null;
}

export interface PlanReadinessDto {
  stage: PlanReadinessStage;
  label: string;
  summary: string;
  ready: boolean;
  verifiedStops: number;
  totalStops: number;
  tasks: PlanPreparationTaskDto[];
}
