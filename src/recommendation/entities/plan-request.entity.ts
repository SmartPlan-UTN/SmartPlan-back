import type { RefinementSpec } from '../../planning-engine/refinement/refinement';
import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { decimalTransformer } from '../../common/typeorm/decimal-transformer';
import { Department } from '../../places/entities/department.entity';
import { Plan } from '../../plans/entities/plan.entity';
import { User } from '../../users/entities/user.entity';
import { RequestStatus } from './request-status.entity';
import { PlanRequestCategory } from './plan-request-category.entity';
import { OutingType } from './outing-type.entity';
import { TimeOfDay } from '../../activities/activity-constraints';
import type { TravelMode } from '../../common/types/travel-mode';
import type { PlanIntent } from '../../planning-engine/intent/plan-intent';

export interface ResolvedSearchOptions {
  /** The structured intent the planning engine works from (PlanIntent v1). */
  intent?: PlanIntent;
  /** This request refines a plan of its parent request. */
  refinement?: RefinementSpec;
  categoryIds?: number[];
  locationSource?: 'explicit' | 'device' | 'profile' | 'default';
  travelMode?: TravelMode;
  excludedCategoryIds?: number[];
  timeOfDay: TimeOfDay | null;
  categorySource: 'explicit' | 'preferences' | 'none';
  intentSource: 'local' | 'gemini' | 'fallback' | 'surprise';
}

export enum PlanRequestMode {
  Automatic = 'automatic',
  Surprise = 'surprise',
}

export const PLAN_REQUEST_PROGRESS_STAGES = [
  'queued',
  'interpreting',
  'locating',
  'searching',
  'composing',
  'routing',
  'finalizing',
] as const;

export type PlanRequestProgressStage =
  (typeof PLAN_REQUEST_PROGRESS_STAGES)[number];

@Check('"budget" IS NULL OR "budget" >= 0')
@Check('"available_duration" IS NULL OR "available_duration" > 0')
@Check('"party_size" IS NULL OR "party_size" >= 1')
@Check(
  'CHK_plan_request_resolved_latitude',
  '"resolved_latitude" IS NULL OR "resolved_latitude" BETWEEN -90 AND 90',
)
@Check(
  'CHK_plan_request_resolved_longitude',
  '"resolved_longitude" IS NULL OR "resolved_longitude" BETWEEN -180 AND 180',
)
@Check(
  'CHK_plan_request_resolved_coordinates',
  '("resolved_latitude" IS NULL) = ("resolved_longitude" IS NULL)',
)
@Check(
  'CHK_plan_request_applied_radius',
  '"applied_max_distance_km" IS NULL OR ("applied_max_distance_km" > 0 AND "resolved_latitude" IS NOT NULL AND "resolved_longitude" IS NOT NULL)',
)
@Entity('plan_request')
export class PlanRequest extends BaseEntity {
  @Index()
  @Column({ name: 'id_user', type: 'integer' })
  idUser: number;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_user' })
  user: User;

  @Column({ type: 'enum', enum: PlanRequestMode })
  mode: PlanRequestMode;

  @Column({ name: 'raw_query', type: 'text', nullable: true })
  rawQuery: string | null;

  @Column({ name: 'raw_context', type: 'jsonb', nullable: true })
  rawContext: Record<string, unknown> | null;

  @Column({ name: 'resolved_options', type: 'jsonb', nullable: true })
  resolvedOptions: ResolvedSearchOptions | null;

  @Column('numeric', {
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  budget: number | null;

  @Column({
    name: 'resolved_latitude',
    type: 'double precision',
    nullable: true,
  })
  resolvedLatitude: number | null;

  @Column({
    name: 'resolved_longitude',
    type: 'double precision',
    nullable: true,
  })
  resolvedLongitude: number | null;

  @Column({ name: 'applied_max_distance_km', type: 'integer', nullable: true })
  appliedMaxDistanceKm: number | null;

  @Index()
  @Column({ name: 'id_department', type: 'integer', nullable: true })
  idDepartment: number | null;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'id_department' })
  department: Department | null;

  @Column({ name: 'available_duration', type: 'integer', nullable: true })
  availableDuration: number | null;

  @Column({ name: 'party_size', type: 'integer', nullable: true })
  partySize: number | null;

  @Index()
  @Column({ name: 'requested_at', type: 'timestamptz' })
  requestedAt: Date;

  @Column({ name: 'progress_stage', type: 'varchar', nullable: true })
  progressStage: PlanRequestProgressStage | null;

  @Column({ name: 'progress_stage_at', type: 'timestamptz', nullable: true })
  progressStageAt: Date | null;

  @Index()
  @Column({ name: 'id_outing_type', type: 'integer', nullable: true })
  idOutingType: number | null;

  @ManyToOne(() => OutingType, (outingType) => outingType.planRequests, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_outing_type' })
  outingType: OutingType | null;

  @Index()
  @Column({ name: 'id_request_status', type: 'integer' })
  idRequestStatus: number;

  @ManyToOne(() => RequestStatus, (status) => status.planRequests, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_request_status' })
  status: RequestStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'intent_resolved_at', type: 'timestamptz', nullable: true })
  intentResolvedAt: Date | null;

  @Column({
    name: 'processing_started_at',
    type: 'timestamptz',
    nullable: true,
  })
  processingStartedAt: Date | null;

  @Column({
    name: 'recovery_attempts',
    type: 'smallint',
    default: 0,
  })
  recoveryAttempts: number;

  @Column({
    name: 'recovery_claimed_at',
    type: 'timestamptz',
    nullable: true,
  })
  recoveryClaimedAt: Date | null;

  @Column({ name: 'failure_code', type: 'varchar', length: 60, nullable: true })
  failureCode: string | null;

  @Column({ name: 'failure_detail', type: 'jsonb', nullable: true })
  failureDetail: Record<string, unknown> | null;

  @Column({ name: 'failed_at', type: 'timestamptz', nullable: true })
  failedAt: Date | null;

  /**
   * What the planner did, with real counts: candidate universe, rejections by
   * reason, shortlist, verification and the combinations evaluated. Drives
   * the honest progress copy and the evaluation harness. Never holds
   * provider content (no Google coordinates or hours).
   */
  @Column({ name: 'generation_trace', type: 'jsonb', nullable: true })
  generationTrace: Record<string, unknown> | null;

  /** The request this one refines ("más barato", "cambiar esta parada"). */
  @Index('IDX_plan_request_parent')
  @Column({ name: 'id_parent_request', type: 'integer', nullable: true })
  idParentRequest: number | null;

  @ManyToOne(() => PlanRequest, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'id_parent_request' })
  parentRequest: PlanRequest | null;

  @OneToMany(() => Plan, (plan) => plan.request)
  plans: Plan[];

  @OneToMany(
    () => PlanRequestCategory,
    (requestCategory) => requestCategory.request,
  )
  categories: PlanRequestCategory[];
}
