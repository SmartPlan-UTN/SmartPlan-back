import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Categoria } from '../../categorias/entities/categoria.entity';
import { EntidadBase } from '../../common/entidades/entidad-base';
import { SolicitudPlan } from './solicitud-plan.entity';

/**
 * Categorías que el usuario pidió para una salida (CU17, CU19). Resuelve la
 * relación N:M entre {@link SolicitudPlan} y {@link Categoria}.
 *
 * Es distinta de `preferencia_usuario`: la preferencia es del perfil y vale
 * para siempre; esto es lo que se pidió esta vez, que puede no tener nada que
 * ver con lo de siempre.
 */
@Index(['idSolicitudPlan', 'idCategoria'], { unique: true })
@Entity('solicitud_plan_categoria')
export class SolicitudPlanCategoria extends EntidadBase {
  @Column({ name: 'id_solicitud_plan', type: 'integer' })
  idSolicitudPlan: number;

  @ManyToOne(() => SolicitudPlan, (solicitud) => solicitud.categorias, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_solicitud_plan' })
  solicitud: SolicitudPlan;

  @Index()
  @Column({ name: 'id_categoria', type: 'integer' })
  idCategoria: number;

  @ManyToOne(() => Categoria, (categoria) => categoria.solicitudes, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_categoria' })
  categoria: Categoria;

  /** Aclaración del usuario sobre esa categoría en particular. */
  @Column({ type: 'text', nullable: true })
  descripcion: string | null;
}
