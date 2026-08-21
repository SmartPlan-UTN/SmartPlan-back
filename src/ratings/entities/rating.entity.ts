import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Activity } from '../../activities/entities/activity.entity';
import { BaseEntity } from '../../common/entities/base-entity';
import { Feedback } from '../../recommendation/entities/feedback.entity';

/**
 * Puntaje que un user le pone a una activity (CU44–CU47, CU55).
 *
 * Sigue la matriz de trazabilidad y PAN 18: se valora cada activity de la
 * experiencia. La {@link Feedback} agrupa opcionalmente los puntajes
 * dejados después de un plan.
 */
@Check('"score" BETWEEN 1 AND 5')
@Entity('rating')
export class Rating extends BaseEntity {
  /** Del 1 al 5. */
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

  /**
   * Nula cuando el user puntúa el plan sin dejar una devolución completa:
   * el puntaje solo (CU44) no obliga a pasar por el circuito de CU23.
   */
  @ManyToOne(() => Feedback, (feedback) => feedback.ratings, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'id_feedback' })
  feedback: Feedback | null;
}
