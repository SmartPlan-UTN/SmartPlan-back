import { Entity, OneToMany } from 'typeorm';
import { CatalogEntity } from '../../common/entities/catalog-entity';
import { Feedback } from './feedback.entity';

@Entity('feedback_status')
export class FeedbackStatus extends CatalogEntity {
  @OneToMany(() => Feedback, (feedback) => feedback.status)
  feedbackes: Feedback[];
}
