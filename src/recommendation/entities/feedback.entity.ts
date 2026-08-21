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
import { Rating } from '../../ratings/entities/rating.entity';
import { FeedbackStatus } from './feedback-status.entity';
import { PlanRequest } from './plan-request.entity';

@Check('"actual_cost" IS NULL OR "actual_cost" >= 0')
@Check('"actual_duration" IS NULL OR "actual_duration" >= 0')
@Entity('feedback')
export class Feedback extends BaseEntity {
  @Column({ type: 'varchar', length: 150 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column('numeric', {
    name: 'actual_cost',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  actualCost: number | null;

  @Column({ name: 'actual_duration', type: 'integer', nullable: true })
  actualDuration: number | null;

  @Index()
  @Column({ name: 'id_plan_request', type: 'integer' })
  idPlanRequest: number;

  @ManyToOne(() => PlanRequest, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_plan_request' })
  request: PlanRequest;

  @Index()
  @Column({ name: 'id_feedback_status', type: 'integer' })
  idFeedbackStatus: number;

  @ManyToOne(() => FeedbackStatus, (status) => status.feedbackes, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_feedback_status' })
  status: FeedbackStatus;

  @OneToMany(() => Rating, (rating) => rating.feedback)
  ratings: Rating[];
}
