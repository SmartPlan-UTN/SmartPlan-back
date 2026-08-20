import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Activity } from '../../activities/entities/activity.entity';
import { BaseEntity } from '../../common/entities/base-entity';
import { decimalTransformer } from '../../common/typeorm/decimal-transformer';
import { Plan } from './plan.entity';

/**
 * Cada ítem de un plan: una activity con su order y su costo estimado
 * (CU13, CU27–CU30).
 *
 * El `order` es lo que convierte un conjunto de activities en un itinerario, y
 * es único dentro del plan para que dos ítems no ocupen la misma posición.
 *
 * El costo y la duración se copian de la activity al armar el plan en place de
 * leerse por la relación: si mañana cambia el precio del catálogo, el plan que
 * el user ya confirmó no tiene por qué cambiar de value solo.
 */
@Index(['idPlan', 'order'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Check('"order" > 0')
@Check('"estimated_cost" >= 0')
@Check('"estimated_duration" >= 0')
@Entity('plan_detail')
export class PlanDetail extends BaseEntity {
  @Column({ name: 'id_plan', type: 'integer' })
  idPlan: number;

  @ManyToOne(() => Plan, (plan) => plan.details, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_plan' })
  plan: Plan;

  @Index()
  @Column({ name: 'id_activity', type: 'integer' })
  idActivity: number;

  @ManyToOne(() => Activity, (activity) => activity.planDetails, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_activity' })
  activity: Activity;

  /** Posición dentro del itinerario, empezando en 1. */
  @Column({ type: 'smallint' })
  order: number;

  @Column('numeric', {
    name: 'estimated_cost',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  estimatedCost: number;

  /** En minutos. */
  @Column({ name: 'estimated_duration', type: 'integer', default: 0 })
  estimatedDuration: number;

  @Column({ type: 'text', nullable: true })
  note: string | null;
}
