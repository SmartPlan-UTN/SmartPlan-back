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
import { Place } from '../../places/entities/place.entity';
import { Plan } from './plan.entity';

@Index(['idPlan', 'order'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Index(['idPlan', 'idActivity'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Index('UQ_plan_detail_place_action', ['idPlan', 'idPlace', 'action'], {
  unique: true,
  where: '"deleted_at" IS NULL AND "id_activity" IS NULL',
})
@Check(
  'CHK_plan_detail_stop_target',
  '"id_activity" IS NOT NULL OR ("id_place" IS NOT NULL AND "action" IS NOT NULL)',
)
@Check(
  'CHK_plan_detail_leg',
  '("leg_travel_minutes" IS NULL OR "leg_travel_minutes" >= 0) AND ("leg_distance_meters" IS NULL OR "leg_distance_meters" >= 0)',
)
@Check('"order" > 0')
@Check(
  'CHK_plan_detail_estimated_cost',
  '"estimated_cost" IS NULL OR "estimated_cost" >= 0',
)
@Check(
  'CHK_plan_detail_per_person_cost',
  '"per_person_cost" IS NULL OR "per_person_cost" >= 0',
)
@Check('"estimated_duration" >= 0')
@Check(
  'CHK_plan_detail_price_kind',
  `"price_kind" IN ('FREE','FIXED','FROM','RANGE','UNKNOWN')`,
)
@Check(
  'CHK_plan_detail_price_shape',
  `("price_kind" = 'UNKNOWN' AND "price_min" IS NULL AND "price_max" IS NULL) OR ` +
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

  /**
   * A stop is either a verified offering (an Activity) or the intrinsic action
   * of a place (dinner at a restaurant): then `idActivity` is null and
   * `idPlace` + `action` say what the stop is. Never fabricated Activity rows.
   */
  @Index()
  @Column({ name: 'id_activity', type: 'integer', nullable: true })
  idActivity: number | null;

  @ManyToOne(() => Activity, (activity) => activity.planDetails, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_activity' })
  activity: Activity | null;

  @Index('IDX_plan_detail_place')
  @Column({ name: 'id_place', type: 'integer', nullable: true })
  idPlace: number | null;

  @ManyToOne(() => Place, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'id_place' })
  place: Place | null;

  /** Activity subtype of a place-action stop (`meal`, `coffee`, `walk`). */
  @Column({ type: 'varchar', length: 40, nullable: true })
  action: string | null;

  /**
   * Planned local start, in minutes from the plan date's midnight (may pass
   * 1440 after midnight). Null for undated plans.
   */
  @Column({ name: 'start_minute', type: 'integer', nullable: true })
  startMinute: number | null;

  /** Estimated travel from the previous stop (our computation, not a route). */
  @Column({ name: 'leg_travel_minutes', type: 'integer', nullable: true })
  legTravelMinutes: number | null;

  @Column({ name: 'leg_distance_meters', type: 'integer', nullable: true })
  legDistanceMeters: number | null;

  /** Why the stop costs what it shows (basis, evidence, uncertainty). */
  @Column({ name: 'estimate_basis', type: 'jsonb', nullable: true })
  estimateBasis: Record<string, unknown> | null;

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

  @Column({
    name: 'per_person_cost',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  perPersonCost: number | null;

  @Column({ name: 'estimated_duration', type: 'integer', default: 0 })
  estimatedDuration: number;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  /** When the person confirmed this stop's pending ticket or reservation. */
  @Column({
    name: 'preparation_confirmed_at',
    type: 'timestamptz',
    nullable: true,
  })
  preparationConfirmedAt: Date | null;
}
