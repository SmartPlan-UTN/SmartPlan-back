import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Activity } from '../../activities/entities/activity.entity';
import { BaseEntity } from '../../common/entities/base-entity';
import { Feedback } from '../../recommendation/entities/feedback.entity';
import { Plan } from '../../plans/entities/plan.entity';
import { User } from '../../users/entities/user.entity';

export enum RatingModerationStatus {
  Pending = 'pending',
  Approved = 'approved',
  Rejected = 'rejected',
}

@Check('"score" BETWEEN 1 AND 5')
@Index('IDX_rating_user_activity_unique', ['idUser', 'idActivity'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Index('IDX_rating_moderation_created', ['moderationStatus', 'createdAt'])
@Entity('rating')
export class Rating extends BaseEntity {
  @Column({ type: 'smallint' })
  score: number;

  @Index()
  @Column({ name: 'id_activity', type: 'integer' })
  idActivity: number;

  @ManyToOne(() => Activity, (activity) => activity.ratings, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_activity' })
  activity: Activity;

  @Index()
  @Column({ name: 'id_user', type: 'integer' })
  idUser: number;

  @ManyToOne(() => User, (user) => user.ratings, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_user' })
  user: User;

  @Index()
  @Column({ name: 'id_plan', type: 'integer' })
  idPlan: number;

  @ManyToOne(() => Plan, (plan) => plan.ratings, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_plan' })
  plan: Plan;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @Column({
    name: 'moderation_status',
    type: 'enum',
    enum: RatingModerationStatus,
  })
  moderationStatus: RatingModerationStatus;

  @Column({
    name: 'moderation_reason',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  moderationReason: string | null;

  @Index()
  @Column({ name: 'id_feedback', type: 'integer', nullable: true })
  idFeedback: number | null;

  @ManyToOne(() => Feedback, (feedback) => feedback.ratings, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'id_feedback' })
  feedback: Feedback | null;
}
