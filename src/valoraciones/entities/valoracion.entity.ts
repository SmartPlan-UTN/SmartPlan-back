import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Actividad } from '../../actividades/entities/actividad.entity';
import { EntidadBase } from '../../common/entidades/entidad-base';
import { Retroalimentacion } from '../../recomendacion/entities/retroalimentacion.entity';

/**
 * Puntaje que un usuario le pone a una actividad (CU44–CU47, CU55).
 *
 * Sigue la matriz de trazabilidad y PAN 18: se valora cada actividad de la
 * experiencia. La {@link Retroalimentacion} agrupa opcionalmente los puntajes
 * dejados después de un plan.
 */
@Check('"puntaje" BETWEEN 1 AND 5')
@Entity('valoracion')
export class Valoracion extends EntidadBase {
  /** Del 1 al 5. */
  @Column({ type: 'smallint' })
  puntaje: number;

  @Index()
  @Column({ name: 'id_actividad', type: 'integer' })
  idActividad: number;

  @ManyToOne(() => Actividad, (actividad) => actividad.valoraciones, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_actividad' })
  actividad: Actividad;

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
