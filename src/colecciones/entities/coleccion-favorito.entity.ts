import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Actividad } from '../../actividades/entities/actividad.entity';
import { EntidadBase } from '../../common/entidades/entidad-base';
import { Coleccion } from './coleccion.entity';

/**
 * Actividad agregada a una colección (CU35–CU37). Resuelve la relación N:M
 * entre {@link Coleccion} y {@link Actividad}, y agrega el orden con el que el
 * usuario las acomodó.
 *
 * El par colección–actividad es único: agregar dos veces la misma actividad no
 * duplica la fila.
 */
@Index(['idColeccion', 'idActividad'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Check('"orden" IS NULL OR "orden" > 0')
@Entity('coleccion_favorito')
export class ColeccionFavorito extends EntidadBase {
  @Column({ name: 'id_coleccion', type: 'integer' })
  idColeccion: number;

  @ManyToOne(() => Coleccion, (coleccion) => coleccion.actividades, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_coleccion' })
  coleccion: Coleccion;

  @Index()
  @Column({ name: 'id_actividad', type: 'integer' })
  idActividad: number;

  @ManyToOne(() => Actividad, (actividad) => actividad.colecciones, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_actividad' })
  actividad: Actividad;

  /** Posición dentro de la colección, ordenada por el usuario. */
  @Column({ type: 'smallint', nullable: true })
  orden: number | null;
}
