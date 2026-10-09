import { PlanDetailResponseDto } from '../../plans/dto/plan-response.dto';
import type {
  PlanRequestMode,
  PlanRequestProgressStage,
} from '../entities/plan-request.entity';

export interface PlanRequestAcceptedDto {
  id: number;
  statusKey: 'pending';
  mode: 'automatic' | 'surprise';
  requestedAt: Date;
}

/**
 * What the system understood from the request — explicit context, free
 * text interpreted by Gemini, or the user's stored preference profile,
 * whichever resolved it (see `PlanGenerationService.resolveIntent()`).
 * Surfaced so the frontend can show it back to the user instead of leaving
 * the result unexplained.
 */
export interface ResolvedPlanContextDto {
  budget: number | null;
  partySize: number | null;
  departmentName: string | null;
  categories: { id: number; name: string }[];
}

export interface PlanRequestStatusDto {
  id: number;
  statusKey: string;
  mode: PlanRequestMode;
  requestedAt: Date;
  query?: string | null;
  progressStage?: PlanRequestProgressStage | null;
  progressStageAt?: Date | null;
  estimatedRemainingSeconds?: number | null;
  /**
   * Declared as the full plan detail shape: `findPlansForRequest()` builds
   * this via `PlansService.findOne()`, the same method behind
   * `GET /plans/:id` — each entry already carries `details[]` (with
   * per-activity coordinates), not just the summary fields.
   */
  plans?: PlanDetailResponseDto[];
  resolvedContext: ResolvedPlanContextDto;
  failedAt?: Date | null;
  failureCode?: string | null;
  failureDetail?: Record<string, unknown> | null;
}
