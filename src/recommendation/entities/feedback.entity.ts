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

/**
 * Devolución del user después de vivir la experiencia (CU21, CU23).
 *
 * Es el insumo con el que el sistema "mejora progresivamente la calidad de las
 * recommendationes", que es parte del objetivo general del proyecto. Agrupa las
 * {@link Rating} que se cargaron en esa devolución.
 *
 * Lo que la hace útil para el motor es el par `actual_cost` / `actual_duration`:
 * la request pidió un budget y un tiempo, el plan estimó los suyos y acá
 * queda lo que efectivamente pasó. Esa diferencia es la que corrige las
 * estimaciones de las próximas recommendationes (CU21).
 */
@Check('"actual_cost" IS NULL OR "actual_cost" >= 0')
@Check('"actual_duration" IS NULL OR "actual_duration" >= 0')
@Entity('feedback')
export class Feedback extends BaseEntity {
  @Column({ type: 'varchar', length: 150 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Lo que la salida terminó costando, en pesos. */
  @Column('numeric', {
    name: 'actual_cost',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  actualCost: number | null;

  /** Lo que la salida terminó durando, en minutos. */
  @Column({ name: 'actual_duration', type: 'integer', nullable: true })
  actualDuration: number | null;

  @Index()
  @Column({ name: 'id_plan_request', type: 'integer' })
  idPlanRequest: number;

  @ManyToOne(() => PlanRequest, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_plan_request' })
  request: PlanRequest;

  /**
   * Status del procesamiento. No figura como atributo en el diagrama, pero sí
   * la relación con {@link FeedbackStatus}, que sin esta column no se
   * puede implementar.
   */
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
