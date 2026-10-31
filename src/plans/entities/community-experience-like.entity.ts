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
import { User } from '../../users/entities/user.entity';

/** A private, reversible reaction to an explicitly shared experience. */
@Index('UQ_community_experience_like_feedback_user', ['idFeedback', 'idUser'], {
  unique: true,
})
@Entity('community_experience_like')
export class CommunityExperienceLike {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('IDX_community_experience_like_feedback')
  @Column({ name: 'id_feedback', type: 'integer' })
  idFeedback: number;

  @ManyToOne(() => Feedback, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_feedback' })
  feedback: Feedback;

  @Index('IDX_community_experience_like_user')
  @Column({ name: 'id_user', type: 'integer' })
  idUser: number;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_user' })
  user: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
