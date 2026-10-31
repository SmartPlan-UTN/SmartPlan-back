import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Feedback } from '../../recommendation/entities/feedback.entity';
import { Plan } from './plan.entity';

/** An explicitly shared repeat, backed by a distinct completed outing. */
@Index('UQ_community_experience_visit_outing', ['idOuting'], { unique: true })
@Index(
  'UQ_community_experience_visit_feedback_outing',
  ['idFeedback', 'idOuting'],
  { unique: true },
)
@Entity('community_experience_visit')
export class CommunityExperienceVisit {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('IDX_community_experience_visit_feedback')
  @Column({ name: 'id_feedback', type: 'integer' })
  idFeedback: number;

  @ManyToOne(() => Feedback, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_feedback' })
  feedback: Feedback;

  @Column({ name: 'id_outing', type: 'integer' })
  idOuting: number;

  @ManyToOne(() => Plan, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_outing' })
  outing: Plan;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
