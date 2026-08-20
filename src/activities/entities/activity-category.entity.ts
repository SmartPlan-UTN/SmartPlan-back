import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Category } from '../../categories/entities/category.entity';
import { BaseEntity } from '../../common/entities/base-entity';
import { Activity } from './activity.entity';

/**
 * Categorías de una activity (CU10, CU53). Resuelve la relación N:M entre
 * {@link Activity} y {@link Category}: una activity puede ser gastronómica y
 * al aire libre a la vez.
 *
 * Las dos claves foráneas están indexadas porque se query en los dos
 * sentidos: "qué categorías tiene esta activity" en la ficha (CU14) y "qué
 * activities hay de esta categoría" en el filtro (CU10).
 */
@Index(['idActivity', 'idCategory'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Entity('activity_category')
export class ActivityCategory extends BaseEntity {
  @Column({ name: 'id_activity', type: 'integer' })
  idActivity: number;

  @ManyToOne(() => Activity, (activity) => activity.categories, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_activity' })
  activity: Activity;

  @Index()
  @Column({ name: 'id_category', type: 'integer' })
  idCategory: number;

  @ManyToOne(() => Category, (category) => category.activities, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_category' })
  category: Category;
}
