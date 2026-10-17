import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';

/**
 * The price an activity had before something replaced it (an estimate derived
 * from user reports takes over a stale official price, for instance). Source
 * evidence is never lost: it moves here.
 */
@Index('IDX_activity_price_history_activity', ['idActivity', 'replacedAt'])
@Entity('activity_price_history')
export class ActivityPriceHistory extends BaseEntity {
  @Column({ name: 'id_activity', type: 'integer' })
  idActivity: number;

  @Column({ name: 'price_kind', type: 'varchar', length: 12 })
  priceKind: string;

  @Column({
    name: 'price_min',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  priceMin: string | null;

  @Column({
    name: 'price_max',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  priceMax: string | null;

  @Column({ name: 'price_unit', type: 'varchar', length: 16, nullable: true })
  priceUnit: string | null;

  @Column({ name: 'price_source', type: 'varchar', length: 20, nullable: true })
  priceSource: string | null;

  @Column({
    name: 'price_source_ref',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  priceSourceRef: string | null;

  @Column({ name: 'price_verified_at', type: 'timestamptz', nullable: true })
  priceVerifiedAt: Date | null;

  @Column({ name: 'replaced_at', type: 'timestamptz' })
  replacedAt: Date;

  /** Why it was replaced, e.g. `observed_estimate`. */
  @Column({ type: 'varchar', length: 40 })
  reason: string;
}
