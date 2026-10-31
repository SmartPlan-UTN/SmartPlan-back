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
import {
  CONTENT_STATUS_ENUM,
  ContentStatus,
} from '../../common/moderation/content-status';
import { decimalTransformer } from '../../common/typeorm/decimal-transformer';
import { Plan } from '../../plans/entities/plan.entity';
import { User } from '../../users/entities/user.entity';
import { Rating } from '../../ratings/entities/rating.entity';
import { FeedbackStatus } from './feedback-status.entity';

export const FEEDBACK_TAGS = [
  'too_expensive',
  'great_value',
  'far',
  'would_recommend',
] as const;

export type FeedbackTag = (typeof FEEDBACK_TAGS)[number];

@Check('"rating" BETWEEN 1 AND 5')
@Check('"actual_cost" IS NULL OR "actual_cost" > 0')
@Check('"actual_duration" IS NULL OR "actual_duration" >= 0')
@Index(
  'UQ_feedback_community_author_plan',
  ['idCommunityAuthor', 'idCommunityPlan'],
  {
    unique: true,
    where:
      '"is_shared" = true AND "id_community_author" IS NOT NULL AND "id_community_plan" IS NOT NULL',
  },
)
@Entity('feedback')
export class Feedback extends BaseEntity {
  @Column({ type: 'smallint' })
  rating: number;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  tags: FeedbackTag[];

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @Column('numeric', {
    name: 'actual_cost',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  actualCost: number | null;

  /**
   * How many people shared the cost the person reported. Used only to turn
   * per-activity amounts into per-person observations.
   */
  @Column({ name: 'actual_party_size', type: 'integer', nullable: true })
  actualPartySize: number | null;

  @Column({ name: 'actual_duration', type: 'integer', nullable: true })
  actualDuration: number | null;

  @Index({ unique: true })
  @Column({ name: 'id_plan', type: 'integer' })
  idPlan: number;

  @OneToOne(() => Plan, (plan) => plan.feedback, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_plan' })
  plan: Plan;

  @Index()
  @Column({ name: 'id_feedback_status', type: 'integer' })
  idFeedbackStatus: number;

  @ManyToOne(() => FeedbackStatus, (status) => status.feedbackes, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_feedback_status' })
  status: FeedbackStatus;

  /**
   * Whether the author shares this experience with the community (#106).
   * Private by default: CU23 feedback only improves recommendations.
   */
  @Column({ name: 'is_shared', type: 'boolean', default: false })
  isShared: boolean;

  /** Stable public identity: one review per author and published plan. */
  @Column({ name: 'id_community_plan', type: 'integer', nullable: true })
  idCommunityPlan: number | null;

  // Same rule as an outing's source plan.
  @ManyToOne(() => Plan, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'id_community_plan',
    foreignKeyConstraintName: 'FK_feedback_community_plan',
  })
  communityPlan: Plan | null;

  @Column({ name: 'id_community_author', type: 'integer', nullable: true })
  idCommunityAuthor: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'id_community_author',
    foreignKeyConstraintName: 'FK_feedback_community_author',
  })
  communityAuthor: User | null;

  /** Version 1 consents to global Community discovery; legacy sharing was plan-scoped. */
  @Column({ name: 'community_consent_version', type: 'smallint', default: 0 })
  communityConsentVersion: number;

  @Column({ name: 'shared_at', type: 'timestamptz', nullable: true })
  sharedAt: Date | null;

  /**
   * Report-based moderation of the public comment (SmartPlan-front#156), set
   * the first time it is shared; `null` while it never was, or when there is
   * no comment.
   */
  @Column({
    name: 'comment_status',
    type: 'enum',
    enum: ContentStatus,
    enumName: CONTENT_STATUS_ENUM,
    nullable: true,
  })
  commentStatus: ContentStatus | null;

  @OneToMany(() => Rating, (rating) => rating.feedback)
  ratings: Rating[];
}
