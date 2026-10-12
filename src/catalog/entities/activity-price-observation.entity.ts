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
@Check('CHK_activity_price_observation_amount', '"amount_per_person" > 0')
@Entity('activity_price_observation')
export class ActivityPriceObservation extends BaseEntity {
  @Column({ name: 'id_activity', type: 'integer' })
  idActivity: number;

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
