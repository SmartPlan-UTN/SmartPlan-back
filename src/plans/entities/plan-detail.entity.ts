import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Activity } from '../../activities/entities/activity.entity';
import { BaseEntity } from '../../common/entities/base-entity';
import { decimalTransformer } from '../../common/typeorm/decimal-transformer';
import { DEFAULT_PRICE_CURRENCY } from '../../common/pricing/price';
import type {
  PriceKind,
  PriceSource,
  PriceUnit,
} from '../../common/pricing/price';
import { Plan } from './plan.entity';

@Index(['idPlan', 'order'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Index(['idPlan', 'idActivity'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Check('"order" > 0')
@Check(
  'CHK_plan_detail_estimated_cost',
  '"estimated_cost" IS NULL OR "estimated_cost" >= 0',
)
@Check('"estimated_duration" >= 0')
@Check(
  'CHK_plan_detail_price_kind',
  `"price_kind" IN ('FREE','FIXED','FROM','RANGE','UNKNOWN')`,
)
@Check(
  'CHK_plan_detail_price_shape',
  `("price_kind" = 'UNKNOWN' AND "price_min" IS NULL AND "price_max" IS NULL AND "estimated_cost" IS NULL) OR ` +
    `("price_kind" = 'FREE' AND "price_min" = 0 AND "price_max" = 0 AND "estimated_cost" = 0) OR ` +
    `("price_kind" IN ('FIXED','FROM','RANGE') AND "price_min" IS NOT NULL AND "estimated_cost" = "price_min")`,
)
@Entity('plan_detail')
export class PlanDetail extends BaseEntity {
  @Column({ name: 'id_plan', type: 'integer' })
  idPlan: number;

  @ManyToOne(() => Plan, (plan) => plan.details, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_plan' })
  plan: Plan;

  @Index()
  @Column({ name: 'id_activity', type: 'integer' })
  idActivity: number;

  @ManyToOne(() => Activity, (activity) => activity.planDetails, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_activity' })
  activity: Activity;

  @Column({ type: 'smallint' })
  order: number;

  /**
   * Price snapshot: what the user was shown when the activity entered the plan.
   * Later edits to the activity's price never rewrite these columns.
   * `estimatedCost` is the snapshot's lower bound, `null` when UNKNOWN.
   */
  @Column('numeric', {
    name: 'estimated_cost',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
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

  @Column({ name: 'price_snapshot_at', type: 'timestamptz', nullable: true })
  priceSnapshotAt: Date | null;

  @Column({ name: 'estimated_duration', type: 'integer', default: 0 })
  estimatedDuration: number;

  @Column({ type: 'text', nullable: true })
  note: string | null;
}
