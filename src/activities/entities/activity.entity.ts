import { Check, Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { decimalTransformer } from '../../common/typeorm/decimal-transformer';
import { FavoriteCollection } from '../../collections/entities/favorite-collection.entity';
import { FavoriteActivity } from '../../favorites/entities/favorite-activity.entity';
import { PlanDetail } from '../../plans/entities/plan-detail.entity';
import { Rating } from '../../ratings/entities/rating.entity';
import { ActivityCategory } from './activity-category.entity';
import { ActivityPlace } from './activity-place.entity';
import type { CostBasis, TimeOfDay } from '../activity-constraints';

@Check('"estimated_cost" >= 0')
@Check('"estimated_duration" > 0')
@Check('CHK_activity_cost_basis', `"cost_basis" IN ('per_party', 'per_person')`)
@Check(
  'CHK_activity_available_times',
  `"available_times_of_day" <@ ARRAY['morning','afternoon','evening','night']::text[]`,
)
@Check(
  'CHK_activity_people',
  '("min_people" IS NULL OR "min_people" >= 1) AND ("max_people" IS NULL OR "max_people" >= 1) AND ("min_people" IS NULL OR "max_people" IS NULL OR "min_people" <= "max_people")',
)
@Entity('activity')
@Index(
  'IDX_activity_search_limits',
  ['estimatedCost', 'estimatedDuration', 'id'],
  { where: '"deleted_at" IS NULL' },
)
export class Activity extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column('numeric', {
    name: 'estimated_cost',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  estimatedCost: number;

  @Column({ name: 'estimated_duration', type: 'integer' })
  estimatedDuration: number;

  @Column({
    name: 'cost_basis',
    type: 'varchar',
    length: 20,
    default: 'per_party',
  })
  costBasis: CostBasis;

  @Column({
    name: 'available_times_of_day',
    type: 'text',
    array: true,
    default: () => "'{}'::text[]",
  })
  availableTimesOfDay: TimeOfDay[];

  @Column({ name: 'min_people', type: 'integer', nullable: true })
  minPeople: number | null;

  @Column({ name: 'max_people', type: 'integer', nullable: true })
  maxPeople: number | null;

  @Index('IDX_activity_type')
  @Column({ type: 'varchar', length: 80, nullable: true })
  type: string | null;

  @OneToMany(() => ActivityCategory, (relation) => relation.activity)
  categories: ActivityCategory[];

  @OneToMany(() => ActivityPlace, (relation) => relation.activity)
  places: ActivityPlace[];

  @OneToMany(() => PlanDetail, (detail) => detail.activity)
  planDetails: PlanDetail[];

  @OneToMany(() => FavoriteActivity, (favorite) => favorite.activity)
  favorites: FavoriteActivity[];

  @OneToMany(() => FavoriteCollection, (favorite) => favorite.activity)
  collections: FavoriteCollection[];

  @OneToMany(() => Rating, (rating) => rating.activity)
  ratings: Rating[];
}
