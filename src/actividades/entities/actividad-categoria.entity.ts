import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Categoria } from '../../categorias/entities/categoria.entity';
import { EntidadBase } from '../../common/entidades/entidad-base';
import { Actividad } from './actividad.entity';

/**
 * Categorías de una actividad (CU10, CU53). Resuelve la relación N:M entre
 * {@link Actividad} y {@link Categoria}: una actividad puede ser gastronómica y
 * al aire libre a la vez.
 *
 * Las dos claves foráneas están indexadas porque se consulta en los dos
 * sentidos: "qué categorías tiene esta actividad" en la ficha (CU14) y "qué
 * actividades hay de esta categoría" en el filtro (CU10).
 */
@Index(['idActividad', 'idCategoria'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Entity('actividad_categoria')
export class ActividadCategoria extends EntidadBase {
  @Column({ name: 'id_actividad', type: 'integer' })
  idActividad: number;

  @ManyToOne(() => Actividad, (actividad) => actividad.categorias, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_actividad' })
  actividad: Actividad;

  @Index()
  @Column({ name: 'id_categoria', type: 'integer' })
  idCategoria: number;

  @ManyToOne(() => Categoria, (categoria) => categoria.actividades, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_categoria' })
  categoria: Categoria;
}
