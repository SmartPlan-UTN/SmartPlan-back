import { Check, Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { decimalTransformer } from '../../common/typeorm/decimal-transformer';
import { FavoriteCollection } from '../../collections/entities/favorite-collection.entity';
import { FavoriteActivity } from '../../favorites/entities/favorite-activity.entity';
import { PlanDetail } from '../../plans/entities/plan-detail.entity';
import { Rating } from '../../ratings/entities/rating.entity';
import { ActivityCategory } from './activity-category.entity';
import { ActivityPlace } from './activity-place.entity';

@Check('"estimated_cost" >= 0')
@Check('"estimated_duration" > 0')
@Entity('activity')
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
