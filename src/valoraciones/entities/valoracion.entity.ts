import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { EntidadBase } from '../../common/entidades/entidad-base';
import { Plan } from '../../planes/entities/plan.entity';
import { Retroalimentacion } from '../../recomendacion/entities/retroalimentacion.entity';

/**
 * Puntaje que un usuario le pone a un plan (CU44–CU47, CU55).
 *
 * En el diagrama la valoración cuelga del **plan** y de la
 * {@link Retroalimentacion} que la agrupa, no de la actividad: se puntúa la
 * experiencia completa. Quién la dejó se resuelve por el plan.
 */
@Entity('valoracion')
export class Valoracion extends EntidadBase {
  /** Del 1 al 5. */
  @Column({ type: 'smallint' })
  puntaje: number;

  @Index()
  @Column({ name: 'id_plan', type: 'integer' })
  idPlan: number;

  @ManyToOne(() => Plan, (plan) => plan.valoraciones, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_plan' })
  plan: Plan;

  @Index()
  @Column({ name: 'id_retroalimentacion', type: 'integer', nullable: true })
  idRetroalimentacion: number | null;

  /**
   * Nula cuando el usuario puntúa el plan sin dejar una devolución completa:
   * el puntaje solo (CU44) no obliga a pasar por el circuito de CU23.
   */
  @ManyToOne(
    () => Retroalimentacion,
    (retroalimentacion) => retroalimentacion.valoraciones,
    { nullable: true, onDelete: 'SET NULL' },
  )
  @JoinColumn({ name: 'id_retroalimentacion' })
  retroalimentacion: Retroalimentacion | null;
}
