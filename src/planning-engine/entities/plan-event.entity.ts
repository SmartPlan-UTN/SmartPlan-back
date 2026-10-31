import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { Plan } from '../../plans/entities/plan.entity';
import { PlanRequest } from '../../recommendation/entities/plan-request.entity';
import { User } from '../../users/entities/user.entity';

/**
 * What happened after SmartPlan recommended something. Signals are not
 * equal: a completed, rated outing with reported spend says far more than a
 * plan opened once (see `signal-weights.ts`). Append-only.
 */
export const PLAN_EVENT_TYPES = [
  'RECOMMENDATION_SHOWN',
  'PLAN_OPENED',
  'PLAN_SAVED',
  'STOP_SWAPPED',
  'STOP_REMOVED',
  'STOP_REORDERED',
  'REFINEMENT_APPLIED',
  'PLAN_STARTED',
  'STOP_SKIPPED',
  'PLAN_COMPLETED',
  'PLAN_RATED',
  'SPEND_REPORTED',
  'STOP_SPEND_REPORTED',
  'EXPERIENCE_TAGS_REPORTED',
  'PRICE_REPORTED_WRONG',
  'PLACE_REPORTED_CLOSED',
  'OFFERING_REPORTED_UNAVAILABLE',
] as const;
export type PlanEventType = (typeof PLAN_EVENT_TYPES)[number];

/** Optional reason a person gave for removing or swapping a stop. */
export const STOP_CHANGE_REASONS = [
  'too_expensive',
  'too_far',
  'not_for_me',
  'already_been',
  'does_not_fit',
] as const;
export type StopChangeReason = (typeof STOP_CHANGE_REASONS)[number];

@Index('IDX_plan_event_type_created', ['type', 'createdAt'])
@Index('IDX_plan_event_user_created', ['idUser', 'createdAt'])
@Index('IDX_plan_event_plan', ['idPlan'])
@Index('IDX_plan_event_request', ['idPlanRequest'])
@Check(
  'CHK_plan_event_type',
  `"type" IN (${PLAN_EVENT_TYPES.map((type) => `'${type}'`).join(',')})`,
)
@Entity('plan_event')
export class PlanEvent extends BaseEntity {
  @Column({ name: 'id_user', type: 'integer' })
  idUser: number;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_user' })
  user: User;

  @Column({ name: 'id_plan', type: 'integer', nullable: true })
  idPlan: number | null;

  @ManyToOne(() => Plan, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'id_plan' })
  plan: Plan | null;

  @Column({ name: 'id_plan_request', type: 'integer', nullable: true })
  idPlanRequest: number | null;

  @ManyToOne(() => PlanRequest, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'id_plan_request' })
  planRequest: PlanRequest | null;

  @Column({ type: 'varchar', length: 40 })
  type: PlanEventType;

  /** Which stop it concerns: `{ activityId }` or `{ placeId, action }`. */
  @Column({ name: 'stop_ref', type: 'jsonb', nullable: true })
  stopRef: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  @Column({
    name: 'ranking_version',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  rankingVersion: string | null;
}
