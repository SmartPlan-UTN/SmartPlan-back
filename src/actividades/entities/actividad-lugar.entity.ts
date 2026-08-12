import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { EntidadBase } from '../../common/entidades/entidad-base';
import { transformadorDecimal } from '../../common/typeorm/transformador-decimal';
import { Lugar } from '../../lugares/entities/lugar.entity';
import { Actividad } from './actividad.entity';

/**
 * Dónde se hace una actividad (CU14, CU16, CU50). Resuelve la relación N:M
 * entre {@link Actividad} y {@link Lugar} y agrega el punto exacto en el mapa.
 *
 * Es N:M y no un `id_lugar` en `actividad` porque la misma experiencia puede
 * ofrecerse en varias sucursales o puntos de encuentro, y un mismo lugar
 * alberga varias actividades.
 *
 * Las coordenadas viven acá y no en `lugar` porque son las del punto de
 * encuentro de esa actividad concreta: la entrada de la bodega no es la misma
 * que el sector de la degustación.
 */
@Index(['idActividad', 'idLugar'], { unique: true })
@Index(['latitud', 'longitud'])
@Entity('actividad_lugar')
export class ActividadLugar extends EntidadBase {
  @Column({ name: 'id_actividad', type: 'integer' })
  idActividad: number;

  @ManyToOne(() => Actividad, (actividad) => actividad.lugares, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_actividad' })
  actividad: Actividad;

  @Index()
  @Column({ name: 'id_lugar', type: 'integer' })
  idLugar: number;

  @ManyToOne(() => Lugar, (lugar) => lugar.actividades, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_lugar' })
  lugar: Lugar;

  /**
   * Latitud y longitud en grados decimales.
   *
   * Van como `numeric(9,6)` y no como `float`: la búsqueda en mapa (CU16)
   * filtra por un rectángulo de coordenadas y `numeric` compara exacto. Seis
   * decimales ubican un punto con un error de ~11 cm, de sobra para un local.
   *
   * Van indexadas juntas por esa misma consulta.
   */
  @Column('numeric', {
    precision: 9,
    scale: 6,
    nullable: true,
    transformer: transformadorDecimal,
  })
  latitud: number | null;

  @Column('numeric', {
    precision: 9,
    scale: 6,
    nullable: true,
    transformer: transformadorDecimal,
  })
  longitud: number | null;

  /** Aclaración del punto de encuentro, cuando la dirección no alcanza. */
  @Column({ type: 'text', nullable: true })
  observaciones: string | null;
}
