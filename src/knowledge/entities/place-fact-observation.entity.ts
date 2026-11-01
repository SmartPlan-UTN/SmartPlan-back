import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { Place } from '../../places/entities/place.entity';

export const FACT_KINDS = [
  'HOURS',
  'PRICE_RANGE',
  'CUISINE',
  'SERVES_MEAL',
  'ACCEPTS_RESERVATIONS',
  'DESCRIPTION_EVIDENCE',
  'MENU_REVIEW',
] as const;
export type FactKind = (typeof FACT_KINDS)[number];

/**
 * One normalized fact read from a venue's source (append-only history):
 * what it said, where, when, until when it is trusted, and a hash to notice
 * when it changes. Hours are also written to `place_opening_hours` (what the
 * planner reads); this row keeps the provenance and the change history.
 */
@Entity('place_fact_observation')
@Index('IDX_place_fact_observation_place', ['idPlace', 'kind', 'observedAt'])
@Check(
  'CHK_place_fact_observation_kind',
  `"kind" IN ('HOURS','PRICE_RANGE','CUISINE','SERVES_MEAL','ACCEPTS_RESERVATIONS','DESCRIPTION_EVIDENCE','MENU_REVIEW')`,
)
@Check('CHK_place_fact_observation_dates', '"expires_at" > "observed_at"')
export class PlaceFactObservation extends BaseEntity {
  @Column({ name: 'id_place', type: 'integer' })
  idPlace: number;

  @ManyToOne(() => Place, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_place' })
  place: Place;

  @Column({ type: 'varchar', length: 30 })
  kind: FactKind;

  @Column({ type: 'jsonb' })
  value: Record<string, unknown>;

  /** How it was read: SCHEMA_ORG, MICRODATA, OFFICIAL_TEXT, MENU_TEXT, PDF… */
  @Column({ type: 'varchar', length: 30 })
  method: string;

  @Column({ name: 'source_url', type: 'varchar', length: 500 })
  sourceUrl: string;

  /** A short quote of what the source says (never a page copy). */
  @Column({ type: 'varchar', length: 300, nullable: true })
  evidence: string | null;

  @Column({ name: 'observed_at', type: 'timestamptz' })
  observedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'content_hash', type: 'varchar', length: 64 })
  contentHash: string;
}
