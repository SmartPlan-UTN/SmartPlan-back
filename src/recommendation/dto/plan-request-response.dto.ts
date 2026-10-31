import { ApiProperty } from '@nestjs/swagger';
import { PlanDetailResponseDto } from '../../plans/dto/plan-response.dto';
import type {
  PlanRequestMode,
  PlanRequestProgressStage,
} from '../entities/plan-request.entity';
import type {
  CommunityPlanRecommendationDto,
  ResultRecommendationSourceDto,
} from '../../planning-engine/community-plan-recommendations.service';

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
export class ResolvedPlanContextDto {
  @ApiProperty({ type: String, enum: ['drive', 'walk', 'bicycle'] })
  travelMode!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['morning', 'afternoon', 'evening', 'night'],
  })
  timeOfDay!: string | null;
  @ApiProperty({ type: Number, nullable: true })
  availableDuration!: number | null;
  /** Radius actually applied; null when no radius or usable search centre exists. */
  @ApiProperty({ type: Number, nullable: true })
  appliedMaxDistanceKm!: number | null;
  @ApiProperty({ type: Number, nullable: true })
  budget!: number | null;
  @ApiProperty({ type: Number, nullable: true })
  partySize!: number | null;
  @ApiProperty({ type: String, nullable: true })
  departmentName!: string | null;
  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      required: ['id', 'name'],
      properties: { id: { type: 'integer' }, name: { type: 'string' } },
    },
  })
  categories!: { id: number; name: string }[];
}

/**
 * Real counts of what the planner did for the first anchor of the plan
 * (e.g. dinner): how many places matched, how many are open (or plausibly
 * open) at that time, how many have a confirmed price within budget, and
 * how many combinations were evaluated. Never estimated or animated counts.
 */
export interface PlanFunnelDto {
  experienceLabel: string;
  places: number;
  openAtTime: number;
  confirmedOpenAtTime?: number;
  knownWithinBudget: number | null;
  /** Open places with some price information. */
  withPrice?: number;
  /** Open places whose own evidence supports the character asked for. */
  fitsCharacter?: number;
  /** The character in the person's words ("Fachero"). */
  character?: string | null;
  combinations: number;
  proposals: number;
  verifiedLive: number;
}

export interface PlanRequestStatusDto {
  /** "Entendimos …": the editable reading of the request (planning engine). */
  understanding?:
    | import('../../planning-engine/intent/understanding').UnderstandingDto
    | null;
  funnel?: PlanFunnelDto | null;
  /** Experiences asked for that the catalog cannot plan yet (e.g. "Cine"). */
  unsupportedExperiences?: string[];
  /** The request this one refined, if any. */
  parentRequestId?: number | null;
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
  /** Request-specific community ideas evaluated against the same resolved intent. */
  communityRecommendations?: CommunityPlanRecommendationDto[];
  /** The first generated proposal; community ideas remain supplementary. */
  primaryRecommendation?: ResultRecommendationSourceDto | null;
  resolvedContext: ResolvedPlanContextDto;
  failedAt?: Date | null;
  failureCode?: string | null;
  failureDetail?: Record<string, unknown> | null;
}

/**
 * One row of `GET /plan-requests`: enough to recognise a past search and
 * reopen it through `GET /plan-requests/:id`, without loading its plans.
 */
export class PlanRequestSummaryDto {
  @ApiProperty({ type: Number })
  id!: number;
  @ApiProperty({ type: String, enum: ['pending', 'processing', 'generated'] })
  statusKey!: string;
  @ApiProperty({ type: String, enum: ['automatic', 'surprise'] })
  mode!: PlanRequestMode;
  @ApiProperty({ type: String, format: 'date-time' })
  requestedAt!: Date;
  @ApiProperty({ type: String, nullable: true })
  query!: string | null;
  /** Generated plans still attached to the request; 0 while in flight. */
  @ApiProperty({ type: Number })
  planCount!: number;
  /** Up to three plan titles, in plan order, for a preview line. */
  @ApiProperty({ type: [String] })
  planTitles!: string[];
}
