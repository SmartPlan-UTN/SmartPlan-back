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
import { PlanIntention } from './plan-intention.entity';

/**
 * Whether a plan may surface to users other than its owner. Consumed only by
 * `GET /api/plan-recommendations` (CU20). A plan becomes `public` when it is
 * AI-generated and reaches `completed`; manual plans (CU24) stay `private`.
 * See migration `AddPlanVisibility`.
 */
export enum PlanVisibility {
  Private = 'private',
  Public = 'public',
}

@Check('"estimated_total_cost" >= 0')
@Check('"estimated_total_duration" >= 0')
@Check('"people_count" >= 1')
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

  @Index()
  @Column({ name: 'id_plan_status', type: 'integer' })
  idPlanStatus: number;

  @ManyToOne(() => PlanStatus, (status) => status.plans, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_plan_status' })
  status: PlanStatus;

  @Column('numeric', {
    name: 'estimated_total_cost',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  estimatedTotalCost: number;

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

  @OneToMany(() => PlanDetail, (detail) => detail.plan)
  details: PlanDetail[];

  @OneToMany(() => FavoritePlan, (favorite) => favorite.plan)
  favorites: FavoritePlan[];

  @OneToMany(() => Rating, (rating) => rating.plan)
  ratings: Rating[];

  /**
   * Post-experience feedback (CU23). At most one per plan — the `id_plan`
   * unique index on `feedback` enforces the 1:1. `null` until the user
   * submits it (never auto-created).
   */
  @OneToOne(() => Feedback, (feedback) => feedback.plan)
  feedback: Feedback | null;
  @OneToMany(() => PlanIntention, (intention) => intention.plan)
  intentions: PlanIntention[];
}
