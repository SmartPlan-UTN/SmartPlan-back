import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Activity } from '../../activities/entities/activity.entity';
import { BaseEntity } from '../../common/entities/base-entity';
import { Feedback } from '../../recommendation/entities/feedback.entity';

@Check('"score" BETWEEN 1 AND 5')
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
  @Column({ name: 'id_feedback', type: 'integer', nullable: true })
  idFeedback: number | null;

  @ManyToOne(() => Feedback, (feedback) => feedback.ratings, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'id_feedback' })
  feedback: Feedback | null;
}
