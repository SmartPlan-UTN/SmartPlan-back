import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { ActividadCategoria } from '../../actividades/entities/actividad-categoria.entity';
import { EntidadBase } from '../../common/entidades/entidad-base';
import { SolicitudPlanCategoria } from '../../recomendacion/entities/solicitud-plan-categoria.entity';
import { PreferenciaUsuario } from '../../usuarios/entities/preferencia-usuario.entity';
import { EstadoCategoria } from './estado-categoria.entity';

/**
 * Categoría de actividades: gastronomía, aire libre, cultura, nocturno
 * (CU10, CU54).
 *
 * Es el eje de tres cosas a la vez: el filtro de búsqueda (CU10), las
 * preferencias del usuario (CU8) y lo que se pide en una solicitud de plan
 * (CU17). Por eso está en el medio de tres relaciones N:M.
 */
@Entity('categoria')
export class Categoria extends EntidadBase {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 80 })
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;

  @Index()
  @Column({ name: 'id_estado_categoria', type: 'integer' })
  idEstadoCategoria: number;

  @ManyToOne(() => EstadoCategoria, (estado) => estado.categorias, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_estado_categoria' })
  estado: EstadoCategoria;

  @OneToMany(() => ActividadCategoria, (relacion) => relacion.categoria)
  actividades: ActividadCategoria[];

  @OneToMany(() => PreferenciaUsuario, (preferencia) => preferencia.categoria)
  preferencias: PreferenciaUsuario[];

  @OneToMany(
    () => SolicitudPlanCategoria,
    (solicitudCategoria) => solicitudCategoria.categoria,
  )
  solicitudes: SolicitudPlanCategoria[];
}
