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

// The case-insensitive partial unique index on LOWER(name) is maintained by
// AddCaseInsensitiveCategoryName. TypeORM cannot represent expression indexes.
@Entity('category')
export class Category extends BaseEntity {
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
