import { Check, Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { decimalTransformer } from '../../common/typeorm/decimal-transformer';
import { FavoriteCollection } from '../../collections/entities/favorite-collection.entity';
import { FavoriteActivity } from '../../favorites/entities/favorite-activity.entity';
import { PlanDetail } from '../../plans/entities/plan-detail.entity';
import { Rating } from '../../ratings/entities/rating.entity';
import { ActivityCategory } from './activity-category.entity';
import { ActivityPlace } from './activity-place.entity';

/**
 * Experiencia concreta del catálogo: "Route del vino en Luján de Cuyo"
 * (CU9–CU11, CU14, CU50, CU53).
 *
 * Es la unidad con la que se arman los plans: el motor combina activities
 * hasta llenar el budget y el tiempo available de la request, así que
 * el costo y la duración estimados son obligatorios.
 */
@Check('"estimated_cost" >= 0')
@Check('"estimated_duration" > 0')
@Entity('activity')
export class Activity extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'text' })
  description: string;

  /**
   * Costo por persona, en pesos. `numeric(10,2)` y no `float`: los importes se
   * suman para calcular el costo del plan (CU30) y el redondeo binario de un
   * `float` haría que dos cuentas equivalentes den distinto.
   */
  @Column('numeric', {
    name: 'estimated_cost',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  estimatedCost: number;

  /** En minutos, para no mezclar unidades al sumar la duración del plan. */
  @Column({ name: 'estimated_duration', type: 'integer' })
  estimatedDuration: number;

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
