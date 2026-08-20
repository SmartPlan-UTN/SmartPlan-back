import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { ActivityCategory } from '../../activities/entities/activity-category.entity';
import { BaseEntity } from '../../common/entities/base-entity';
import { PlanRequestCategory } from '../../recommendation/entities/plan-request-category.entity';
import { UserPreference } from '../../users/entities/user-preference.entity';
import { CategoryStatus } from './category-status.entity';

/**
 * Categoría de activities: gastronomía, aire libre, cultura, nocturno
 * (CU10, CU54).
 *
 * Es el eje de tres cosas a la vez: el filtro de búsqueda (CU10), las
 * preferences del user (CU8) y lo que se pide en una request de plan
 * (CU17). Por eso está en el medio de tres relaciones N:M.
 */
@Entity('category')
export class Category extends BaseEntity {
  @Index({ unique: true, where: '"deleted_at" IS NULL' })
  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Index()
  @Column({ name: 'id_category_status', type: 'integer' })
  idCategoryStatus: number;

  @ManyToOne(() => CategoryStatus, (status) => status.categories, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_category_status' })
  status: CategoryStatus;

  @OneToMany(() => ActivityCategory, (relation) => relation.category)
  activities: ActivityCategory[];

  @OneToMany(() => UserPreference, (preference) => preference.category)
  preferences: UserPreference[];

  @OneToMany(
    () => PlanRequestCategory,
    (requestCategory) => requestCategory.category,
  )
  planRequests: PlanRequestCategory[];
}
