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
import { Departamento } from '../../lugares/entities/departamento.entity';
import { Plan } from '../../planes/entities/plan.entity';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { EstadoSolicitud } from './estado-solicitud.entity';
import { SolicitudPlanCategoria } from './solicitud-plan-categoria.entity';
import { TipoSalida } from './tipo-salida.entity';

/**
 * Parámetros con los que el usuario pide un plan (CU17, CU19, CU31).
 *
 * Se guarda como entidad y no como un DTO de paso porque es la entrada del
 * motor de recomendación: CU21 ajusta las recomendaciones "según historial", y
 * ese historial son las solicitudes anteriores cruzadas con la
 * retroalimentación que dejó cada una.
 *
 * Las categorías pedidas van en `solicitud_plan_categoria`, porque son varias.
 * La zona se expresa como un departamento y el tiempo disponible en minutos,
 * para que el motor pueda filtrar actividades sin interpretar texto libre.
 *
 * > El diagrama lista en esta clase un `id_solicitud_plan`, que sería una clave
 * > foránea a sí misma con el nombre de su propia clave primaria, y por otro
 * > lado documenta que la solicitud "se relaciona con usuario" sin mostrar la
 * > columna. Acá se implementa esa relación como `id_usuario`: una solicitud
 * > sin dueño no se puede listar en el historial (PAN 13) ni usar para ajustar
 * > recomendaciones.
 */
@Check('"presupuesto" >= 0')
@Check('"duracion_disponible" > 0')
@Entity('solicitud_plan')
export class SolicitudPlan extends EntidadBase {
  @Index()
  @Column({ name: 'id_usuario', type: 'integer' })
  idUsuario: number;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_usuario' })
  usuario: Usuario;

  /** Presupuesto disponible para la salida, en pesos. */
  @Column('numeric', {
    precision: 10,
    scale: 2,
    transformer: transformadorDecimal,
  })
  presupuesto: number;

  /** Zona elegida para la salida. */
  @Index()
  @Column({ name: 'id_departamento', type: 'integer' })
  idDepartamento: number;

  @ManyToOne(() => Departamento, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'id_departamento' })
  departamento: Departamento;

  /** Tiempo máximo disponible para el plan, en minutos. */
  @Column({ name: 'duracion_disponible', type: 'integer' })
  duracionDisponible: number;

  /** Cuándo se pidió el plan. Ordena el historial del usuario (PAN 13). */
  @Index()
  @Column({ name: 'fecha_solicitud', type: 'timestamptz' })
  fechaSolicitud: Date;

  @Index()
  @Column({ name: 'id_tipo_salida', type: 'integer' })
  idTipoSalida: number;

  @ManyToOne(() => TipoSalida, (tipoSalida) => tipoSalida.solicitudes, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_tipo_salida' })
  tipoSalida: TipoSalida;

  @Index()
  @Column({ name: 'id_estado_solicitud', type: 'integer' })
  idEstadoSolicitud: number;

  @ManyToOne(() => EstadoSolicitud, (estado) => estado.solicitudes, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_estado_solicitud' })
  estado: EstadoSolicitud;

  /** Texto libre del usuario: "algo tranquilo", "cerca del centro". */
  @Column({ type: 'text', nullable: true })
  observaciones: string | null;

  @OneToMany(() => Plan, (plan) => plan.solicitud)
  planes: Plan[];

  @OneToMany(
    () => SolicitudPlanCategoria,
    (solicitudCategoria) => solicitudCategoria.solicitud,
  )
  categorias: SolicitudPlanCategoria[];
}
