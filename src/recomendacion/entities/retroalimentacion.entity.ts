import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { EntidadBase } from '../../common/entidades/entidad-base';
import { transformadorDecimal } from '../../common/typeorm/transformador-decimal';
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
 * Lo que la hace útil para el motor es el par `costo_real` / `duracion_real`:
 * la solicitud pidió un presupuesto y un tiempo, el plan estimó los suyos y acá
 * queda lo que efectivamente pasó. Esa diferencia es la que corrige las
 * estimaciones de las próximas recomendaciones (CU21).
 */
@Entity('retroalimentacion')
export class Retroalimentacion extends EntidadBase {
  @Column({ type: 'varchar', length: 150 })
  titulo: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;

  /** Lo que la salida terminó costando, en pesos. */
  @Column('numeric', {
    name: 'costo_real',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: transformadorDecimal,
  })
  costoReal: number | null;

  /** Lo que la salida terminó durando, en minutos. */
  @Column({ name: 'duracion_real', type: 'integer', nullable: true })
  duracionReal: number | null;

  @Index()
  @Column({ name: 'id_solicitud_plan', type: 'integer' })
  idSolicitudPlan: number;

  @ManyToOne(() => SolicitudPlan, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_solicitud_plan' })
  solicitud: SolicitudPlan;

  /**
   * Estado del procesamiento. No figura como atributo en el diagrama, pero sí
   * la relación con {@link EstadoRetroalimentacion}, que sin esta columna no se
   * puede implementar.
   */
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

  @OneToMany(() => Valoracion, (valoracion) => valoracion.retroalimentacion)
  valoraciones: Valoracion[];
}
