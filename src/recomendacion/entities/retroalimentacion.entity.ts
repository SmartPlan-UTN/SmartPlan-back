import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { EntidadBase } from '../../common/entidades/entidad-base';
import { Valoracion } from '../../valoraciones/entities/valoracion.entity';
import { EstadoRetroalimentacion } from './estado-retroalimentacion.entity';
import { SolicitudPlan } from './solicitud-plan.entity';

/**
 * Devolución del usuario después de vivir la experiencia (CU21, CU23).
 *
 * Es el insumo con el que el sistema "mejora progresivamente la calidad de las
 * recomendaciones", que es parte del objetivo general del proyecto. Agrupa las
 * {@link Valoracion} que se cargaron en esa devolución.
 *
 * > En el diagrama esta clase aparece con los atributos cortados: lo único
 * > legible es `id` y sus dos relaciones. Se implementan las relaciones tal
 * > como están, más `id_solicitud_plan`, que es lo que la matriz de
 * > trazabilidad asocia a CU23 (`retroalimentacion`, `estado_retroalimentacion`,
 * > `solicitud_plan`), y un `comentario` para el texto de la devolución. Al
 * > implementar CU23 hay que contrastar esto contra el diagrama original.
 */
@Entity('retroalimentacion')
export class Retroalimentacion extends EntidadBase {
  @Index()
  @Column({ name: 'id_solicitud_plan', type: 'integer', nullable: true })
  idSolicitudPlan: number | null;

  /** Nula si la devolución es sobre un plan que el usuario armó a mano (CU24). */
  @ManyToOne(() => SolicitudPlan, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'id_solicitud_plan' })
  solicitud: SolicitudPlan | null;

  @Index()
  @Column({ name: 'id_estado_retroalimentacion', type: 'integer' })
  idEstadoRetroalimentacion: number;

  @ManyToOne(
    () => EstadoRetroalimentacion,
    (estado) => estado.retroalimentaciones,
    { nullable: false, onDelete: 'RESTRICT' },
  )
  @JoinColumn({ name: 'id_estado_retroalimentacion' })
  estado: EstadoRetroalimentacion;

  @Column({ type: 'text', nullable: true })
  comentario: string | null;

  @OneToMany(() => Valoracion, (valoracion) => valoracion.retroalimentacion)
  valoraciones: Valoracion[];
}
