import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Actividad } from '../../actividades/entities/actividad.entity';
import { EntidadBase } from '../../common/entidades/entidad-base';
import { transformadorDecimal } from '../../common/typeorm/transformador-decimal';
import { Plan } from './plan.entity';

/**
 * Cada ítem de un plan: una actividad con su orden y su costo estimado
 * (CU13, CU27–CU30).
 *
 * El `orden` es lo que convierte un conjunto de actividades en un itinerario, y
 * es único dentro del plan para que dos ítems no ocupen la misma posición.
 *
 * El costo y la duración se copian de la actividad al armar el plan en lugar de
 * leerse por la relación: si mañana cambia el precio del catálogo, el plan que
 * el usuario ya confirmó no tiene por qué cambiar de valor solo.
 */
@Index(['idPlan', 'orden'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Check('"orden" > 0')
@Check('"costo_estimado" >= 0')
@Check('"duracion_estimada" >= 0')
@Entity('detalle_plan')
export class DetallePlan extends EntidadBase {
  @Column({ name: 'id_plan', type: 'integer' })
  idPlan: number;

  @ManyToOne(() => Plan, (plan) => plan.detalles, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_plan' })
  plan: Plan;

  @Index()
  @Column({ name: 'id_actividad', type: 'integer' })
  idActividad: number;

  @ManyToOne(() => Actividad, (actividad) => actividad.detallesDePlan, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_actividad' })
  actividad: Actividad;

  /** Posición dentro del itinerario, empezando en 1. */
  @Column({ type: 'smallint' })
  orden: number;

  @Column('numeric', {
    name: 'costo_estimado',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: transformadorDecimal,
  })
  costoEstimado: number;

  /** En minutos. */
  @Column({ name: 'duracion_estimada', type: 'integer', default: 0 })
  duracionEstimada: number;

  @Column({ type: 'text', nullable: true })
  observacion: string | null;
}
