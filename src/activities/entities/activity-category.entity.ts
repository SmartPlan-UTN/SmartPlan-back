import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Category } from '../../categories/entities/category.entity';
import { BaseEntity } from '../../common/entities/base-entity';
import { Activity } from './activity.entity';

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
