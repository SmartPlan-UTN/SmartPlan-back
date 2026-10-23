import { Check, Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';

/**
 * What kinds of language trouble SmartPlan keeps for product review.
 *
 * - `UNMAPPED_TERM`: a word the reader could not place at all.
 * - `LOW_CONFIDENCE`: a facet the model read with too little confidence to
 *   apply (so it did not steer the recommendation).
 * - `UNRESOLVED_NEGATION`: "no <something>" whose subject was not understood.
 * - `REFINEMENT`: a phrase after which the person had to refine the plan,
 *   a sign the first reading missed.
 */
export const LANGUAGE_OBSERVATION_KINDS = [
  'UNMAPPED_TERM',
  'LOW_CONFIDENCE',
  'UNRESOLVED_NEGATION',
  'REFINEMENT',
] as const;
export type LanguageObservationKind =
  (typeof LANGUAGE_OBSERVATION_KINDS)[number];

/**
 * A normalised phrase seen in requests, with how often. It holds no user id
 * and no full query: only the short normalised phrase and a summary of how it
 * was read, so the language can be improved without keeping what people wrote.
 */
@Index('UQ_language_observation_phrase', ['kind', 'phrase'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Index('IDX_language_observation_frequency', ['kind', 'occurrences'])
@Check(
  'CHK_language_observation_kind',
  `"kind" IN (${LANGUAGE_OBSERVATION_KINDS.map((kind) => `'${kind}'`).join(',')})`,
)
@Entity('language_observation')
export class LanguageObservation extends BaseEntity {
  @Column({ type: 'varchar', length: 24 })
  kind: LanguageObservationKind;

  @Column({ type: 'varchar', length: 60 })
  phrase: string;

  @Column({ type: 'integer', default: 1 })
  occurrences: number;

  @Column({ name: 'first_seen_at', type: 'timestamptz' })
  firstSeenAt: Date;

  @Column({ name: 'last_seen_at', type: 'timestamptz' })
  lastSeenAt: Date;

  /** How the request was read when the phrase appeared (facet keys, actions). */
  @Column({ type: 'jsonb', nullable: true })
  reading: Record<string, unknown> | null;
}
