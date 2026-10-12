import { Check, Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { decimalTransformer } from '../../common/typeorm/decimal-transformer';
import { DEFAULT_PRICE_CURRENCY } from '../../common/pricing/price';
import type { CatalogStatus } from '../../catalog/catalog.constants';
import type {
  PriceKind,
  PriceSource,
  PriceUnit,
} from '../../common/pricing/price';
import { FavoriteCollection } from '../../collections/entities/favorite-collection.entity';
import { FavoriteActivity } from '../../favorites/entities/favorite-activity.entity';
import { PlanDetail } from '../../plans/entities/plan-detail.entity';
import { Rating } from '../../ratings/entities/rating.entity';
import { ActivityCategory } from './activity-category.entity';
import { ActivityPlace } from './activity-place.entity';

@Check(
  'CHK_activity_estimated_cost',
  '"estimated_cost" IS NULL OR "estimated_cost" >= 0',
)
@Check('"estimated_duration" > 0')
@Index('IDX_activity_listing', ['status', 'discoverable'], {
  where: '"deleted_at" IS NULL',
})
@Index('IDX_activity_slug', ['slug'], {
  unique: true,
  where: '"slug" IS NOT NULL AND "deleted_at" IS NULL',
})
@Check(
  'CHK_activity_status',
  `"status" IN ('draft','in_review','published','archived')`,
)
@Check(
  'CHK_activity_price_kind',
  `"price_kind" IN ('FREE','FIXED','FROM','RANGE','UNKNOWN')`,
)
@Check(
  'CHK_activity_price_shape',
  `("price_kind" = 'UNKNOWN' AND "price_min" IS NULL AND "price_max" IS NULL AND "price_source" IS NULL) OR ` +
    `("price_kind" = 'FREE' AND "price_min" = 0 AND "price_max" = 0 AND "estimated_cost" = 0 AND "price_source" IS NOT NULL AND "price_source" NOT IN ('PROVIDER_HINT','LEGACY')) OR ` +
    `("price_kind" = 'FIXED' AND "price_min" IS NOT NULL AND "price_max" = "price_min" AND "estimated_cost" = "price_min" AND "price_source" IS NOT NULL) OR ` +
    `("price_kind" = 'FROM' AND "price_min" IS NOT NULL AND "price_max" IS NULL AND "estimated_cost" = "price_min" AND "price_source" IS NOT NULL) OR ` +
    `("price_kind" = 'RANGE' AND "price_min" IS NOT NULL AND "price_max" > "price_min" AND "estimated_cost" = "price_min" AND "price_source" IS NOT NULL)`,
)
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
    nullable: true,
    transformer: decimalTransformer,
  })
  /**
   * Legacy representative amount: the lower bound of the price, `null` when the
   * price is UNKNOWN. Kept in sync with `price_min` by a CHECK constraint.
   * Prefer the `price*` fields; never read `null` here as free.
   */
  estimatedCost: number | null;

  @Column({
    name: 'price_kind',
    type: 'varchar',
    length: 10,
    default: 'UNKNOWN',
  })
  priceKind: PriceKind;

  @Column('numeric', {
    name: 'price_min',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  priceMin: number | null;

  @Column('numeric', {
    name: 'price_max',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  priceMax: number | null;

  @Column({ name: 'price_unit', type: 'varchar', length: 20, nullable: true })
  priceUnit: PriceUnit | null;

  @Column({
    name: 'price_currency',
    type: 'varchar',
    length: 3,
    default: DEFAULT_PRICE_CURRENCY,
  })
  priceCurrency: string;

  @Column({ name: 'price_source', type: 'varchar', length: 20, nullable: true })
  priceSource: PriceSource | null;

  @Column({
    name: 'price_source_ref',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  priceSourceRef: string | null;

  @Column({ name: 'price_verified_at', type: 'timestamptz', nullable: true })
  priceVerifiedAt: Date | null;

  @Column({ name: 'estimated_duration', type: 'integer' })
  estimatedDuration: number;

  /** Stable catalog identity used by imports and version packages. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  slug: string | null;

  /** Lifecycle. Publication does not imply recommendation safety. */
  @Column({ type: 'varchar', length: 12, default: 'published' })
  status: CatalogStatus;

  /** May appear in exploration, the map and search. */
  @Column({ type: 'boolean', default: true })
  discoverable: boolean;

  /** A real thing a person can add to a plan, with the minimum planning data. */
  @Column({ name: 'plan_eligible', type: 'boolean', default: true })
  planEligible: boolean;

  /** Trustworthy enough for automatic recommendation and generation. */
  @Column({ name: 'auto_recommend_eligible', type: 'boolean', default: true })
  autoRecommendEligible: boolean;

  /** Why a flag is false (machine-computed), for review tooling. */
  @Column({ name: 'eligibility_reasons', type: 'jsonb', nullable: true })
  eligibilityReasons: string[] | null;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

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
