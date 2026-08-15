import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { EntidadBase } from '../../common/entidades/entidad-base';
import { transformadorDecimal } from '../../common/typeorm/transformador-decimal';
import { PlanFavorito } from '../../favoritos/entities/plan-favorito.entity';
import { SolicitudPlan } from '../../recomendacion/entities/solicitud-plan.entity';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { DetallePlan } from './detalle-plan.entity';
import { EstadoPlan } from './estado-plan.entity';

/**
 * Conjunto ordenado de actividades que conforma una experiencia social
 * (CU12, CU13, CU17, CU24–CU31, CU60).
 *
 * Es la entidad central del sistema: la genera el motor a partir de una
 * `solicitud_plan` o la arma el usuario a mano (CU24), y sus ítems están en
 * `detalle_plan`.
 *
 * Todo plan tiene un dueño explícito. Los generados también conservan la
 * solicitud que los originó; los creados a mano (CU24) dejan esa relación nula.
 */
@Check('"costo_total_estimado" >= 0')
@Check('"duracion_total_estimada" >= 0')
@Entity('plan')
export class Plan extends EntidadBase {
  @Column({ type: 'varchar', length: 150 })
  titulo: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;

  @Index()
  @Column({ name: 'id_usuario', type: 'integer' })
  idUsuario: number;

  @ManyToOne(() => Usuario, (usuario) => usuario.planes, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_usuario' })
  usuario: Usuario;

  @Index()
  @Column({ name: 'id_solicitud_plan', type: 'integer', nullable: true })
  idSolicitudPlan: number | null;

  /** Nula en los planes creados a mano (CU24), que no salen de una solicitud. */
  @ManyToOne(() => SolicitudPlan, (solicitud) => solicitud.planes, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'id_solicitud_plan' })
  solicitud: SolicitudPlan | null;

  @Index()
  @Column({ name: 'id_estado_plan', type: 'integer' })
  idEstadoPlan: number;

  @ManyToOne(() => EstadoPlan, (estado) => estado.planes, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_estado_plan' })
  estado: EstadoPlan;

  /**
   * Costo total (CU30) y duración total, desnormalizados desde `detalle_plan`.
   *
   * Se guardan en lugar de calcularse en cada consulta porque el listado de
   * planes los muestra en cada tarjeta: recalcularlos obligaría a sumar los
   * detalles de todos los planes de la página. Los recalcula el servicio de
   * planes cada vez que se agrega o se quita una actividad (CU27, CU28).
   */
  @Column('numeric', {
    name: 'costo_total_estimado',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: transformadorDecimal,
  })
  costoTotalEstimado: number;

  /** En minutos. */
  @Column({ name: 'duracion_total_estimada', type: 'integer', default: 0 })
  duracionTotalEstimada: number;

  @OneToMany(() => DetallePlan, (detalle) => detalle.plan)
  detalles: DetallePlan[];

  @OneToMany(() => PlanFavorito, (favorito) => favorito.plan)
  favoritos: PlanFavorito[];
}
