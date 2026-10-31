import { Check, Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { decimalTransformer } from '../../common/typeorm/decimal-transformer';

/**
 * What one person reported paying for ONE activity, kept apart from the plan
 * total they also reported: a plan total is never split across activities.
 * Observations never overwrite official or curated evidence; the estimator
 * derives a price from recent ones (see `price-observation.ts`).
 */
@Index('IDX_activity_price_observation_activity', ['idActivity', 'observedAt'])
@Index(
  'UQ_activity_price_observation_feedback_activity',
  ['idFeedback', 'idActivity'],
  { unique: true, where: '"deleted_at" IS NULL' },
)
@Index('IDX_activity_price_observation_place', [
  'idPlace',
  'action',
  'observedAt',
])
@Check('CHK_activity_price_observation_amount', '"amount_per_person" > 0')
@Check(
  'CHK_activity_price_observation_target',
  '"id_activity" IS NOT NULL OR ("id_place" IS NOT NULL AND "action" IS NOT NULL)',
)
@Entity('activity_price_observation')
export class ActivityPriceObservation extends BaseEntity {
  /** The offering paid for; null for a place-action stop (`idPlace` + `action`). */
  @Column({ name: 'id_activity', type: 'integer', nullable: true })
  idActivity: number | null;

  @Column({ name: 'id_place', type: 'integer', nullable: true })
  idPlace: number | null;

  /** Activity subtype of a place-action stop (e.g. `meal`). */
  @Column({ type: 'varchar', length: 40, nullable: true })
  action: string | null;

  @Column({ name: 'id_feedback', type: 'integer' })
  idFeedback: number;

  /** What the person said they paid for this activity (their whole party). */
  @Column({
    name: 'amount_reported',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  amountReported: number;

  @Column({ name: 'party_size', type: 'integer' })
  partySize: number;

  /** `amountReported / partySize`: the unit the estimator works in. */
  @Column({
    name: 'amount_per_person',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  amountPerPerson: number;

  @Column({ type: 'varchar', length: 3, default: 'ARS' })
  currency: string;

  @Column({ name: 'observed_at', type: 'timestamptz' })
  observedAt: Date;
}
