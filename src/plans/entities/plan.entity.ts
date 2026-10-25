import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { decimalTransformer } from '../../common/typeorm/decimal-transformer';
import { FavoritePlan } from '../../favorites/entities/favorite-plan.entity';
import { Feedback } from '../../recommendation/entities/feedback.entity';
import { PlanRequest } from '../../recommendation/entities/plan-request.entity';
import { User } from '../../users/entities/user.entity';
import { PlanDetail } from './plan-detail.entity';
import { PlanStatus } from './plan-status.entity';
import { Rating } from '../../ratings/entities/rating.entity';
import {
  CONTENT_STATUS_ENUM,
  ContentStatus,
} from '../../common/moderation/content-status';
import type { PriceCompleteness } from '../../common/pricing/price';

/**
 * Whether an `authored` plan may surface to users other than its owner:
 * exploration (CU12), detail (CU13), recommendations (CU20), and outings
 * (CU22). Every plan starts `private`; only its author publishes it. Generated
 * alternatives and outings are always `private`.
 */
export enum PlanVisibility {
  Private = 'private',
  Public = 'public',
}

/**
 * What a `plan` row represents. They share one table so the itinerary,
 * totals, feedback (CU23), and ratings (CU44) work the same for all three.
 *
 *  - `authored`: created by a person in "Mis planes" (CU24); it can be
 *    published.
 *  - `generated`: one alternative returned by a plan request (CU17, CU19).
 *    It belongs to the requester, is never published, and never appears in
 *    the authored listing. Its owner can reopen it in the generated history.
 *  - `outing`: a person's frozen copy of a plan they chose to do (CU22), with
 *    its own `to_do` / `completed` lifecycle and feedback. `idSourcePlan`
 *    points at the plan it was copied from.
 */
export enum PlanKind {
  Authored = 'authored',
  Generated = 'generated',
  Outing = 'outing',
}

// At most one outing still to do per person and source plan, so "Lo voy a
// hacer" cannot duplicate it under a double click, retry, or concurrency.
// Completed and cancelled outings are outside the index, so doing the same
// plan again creates a new outing (CU22).
@Index('IDX_plan_active_outing_unique', ['idUser', 'idSourcePlan'], {
  unique: true,
  where: `"kind" = 'outing' AND "completed_at" IS NULL AND "deleted_at" IS NULL`,
})
@Check(
  'CHK_plan_estimated_total_cost',
  '"estimated_total_cost" IS NULL OR "estimated_total_cost" >= 0',
)
@Check(
  'CHK_plan_price_completeness',
  `"price_completeness" IN ('EXACT','RANGE','LOWER_BOUND','PARTIAL','NONE')`,
)
@Check('"estimated_total_duration" >= 0')
@Check('"people_count" >= 1')
@Index('IDX_plan_composer_request', ['idUser', 'composerRequestId'], {
  unique: true,
  where: '"composer_request_id" IS NOT NULL',
})
@Entity('plan')
export class Plan extends BaseEntity {
  @Column({ type: 'varchar', length: 150 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Index()
  @Column({ name: 'id_user', type: 'integer' })
  idUser: number;

  @ManyToOne(() => User, (user) => user.plans, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_user' })
  user: User;

  @Index()
  @Column({ name: 'id_plan_request', type: 'integer', nullable: true })
  idPlanRequest: number | null;

  @ManyToOne(() => PlanRequest, (request) => request.plans, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'id_plan_request' })
  request: PlanRequest | null;

  @Index('IDX_plan_kind')
  @Column({
    name: 'kind',
    type: 'enum',
    enum: PlanKind,
    default: PlanKind.Authored,
  })
  kind: PlanKind;

  /** Source of an outing or an authored copy of a generated result. */
  @Index('IDX_plan_source_plan')
  @Column({ name: 'id_source_plan', type: 'integer', nullable: true })
  idSourcePlan: number | null;

  @ManyToOne(() => Plan, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'id_source_plan' })
  sourcePlan: Plan | null;

  @Index()
  @Column({ name: 'id_plan_status', type: 'integer' })
  idPlanStatus: number;

  @ManyToOne(() => PlanStatus, (status) => status.plans, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_plan_status' })
  status: PlanStatus;

  /**
   * Known lower bound of the group total. `null` when no activity is priced
   * (completeness NONE): an unpriced plan is not a free plan.
   */
  @Column('numeric', {
    name: 'estimated_total_cost',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  estimatedTotalCost: number | null;

  /** Upper bound of the group total; `null` when open-ended or unpriced. */
  @Column('numeric', {
    name: 'estimated_total_cost_max',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  estimatedTotalCostMax: number | null;

  @Column({ name: 'unpriced_count', type: 'integer', default: 0 })
  unpricedCount: number;

  @Column({
    name: 'price_completeness',
    type: 'varchar',
    length: 12,
    default: 'EXACT',
  })
  priceCompleteness: PriceCompleteness;

  @Column({ name: 'estimated_total_duration', type: 'integer', default: 0 })
  estimatedTotalDuration: number;

  @Column({ name: 'people_count', type: 'integer', default: 1 })
  peopleCount: number;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({
    name: 'feedback_requested_at',
    type: 'timestamptz',
    nullable: true,
  })
  feedbackRequestedAt: Date | null;

  @Column({
    name: 'travel_distance_meters',
    type: 'integer',
    nullable: true,
  })
  travelDistanceMeters: number | null;

  @Column({
    name: 'travel_duration_seconds',
    type: 'integer',
    nullable: true,
  })
  travelDurationSeconds: number | null;

  @Index('IDX_plan_visibility')
  @Column({
    name: 'visibility',
    type: 'enum',
    enum: PlanVisibility,
    default: PlanVisibility.Private,
  })
  visibility: PlanVisibility;

  /**
   * Report-based moderation of a published plan. Unlike a rating or an
   * experience, a report never hides it: it stays `published` while an
   * administrator decides. Removing it makes it private, and its author
   * cannot publish it again.
   */
  @Column({
    name: 'community_status',
    type: 'enum',
    enum: ContentStatus,
    enumName: CONTENT_STATUS_ENUM,
    default: ContentStatus.Published,
  })
  communityStatus: ContentStatus;

  /** Stable per-draft key: a retried create updates/returns the same plan. */
  @Column({ name: 'composer_request_id', type: 'uuid', nullable: true })
  composerRequestId: string | null;

  /** Last edit request key and payload fingerprint for safe network retries. */
  @Column({ name: 'composer_update_request_id', type: 'uuid', nullable: true })
  composerUpdateRequestId: string | null;

  @Column({
    name: 'composer_update_request_hash',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  composerUpdateRequestHash: string | null;

  @OneToMany(() => PlanDetail, (detail) => detail.plan)
  details: PlanDetail[];

  @OneToMany(() => FavoritePlan, (favorite) => favorite.plan)
  favorites: FavoritePlan[];

  @OneToMany(() => Rating, (rating) => rating.plan)
  ratings: Rating[];

  /**
   * Post-experience feedback (CU23). Only an `outing` receives it, at most
   * one per outing — the `id_plan` unique index on `feedback` enforces the
   * 1:1. `null` until the user submits it (never auto-created).
   */
  @OneToOne(() => Feedback, (feedback) => feedback.plan)
  feedback: Feedback | null;
}
