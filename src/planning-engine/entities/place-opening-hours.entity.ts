import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { Place } from '../../places/entities/place.entity';

/** Sources SmartPlan may retain hours from (never a provider's live answer). */
export const DURABLE_HOURS_SOURCES = [
  'OFFICIAL',
  'SCHEMA_ORG',
  'CURATED',
  'USER',
] as const;
export type DurableHoursSource = (typeof DURABLE_HOURS_SOURCES)[number];

/**
 * One opening interval of a place on a weekday, from a source SmartPlan is
 * allowed to keep (official website, Schema.org markup, curator, validated
 * user reports), with when it was verified and when it stops being trusted.
 * An interval may cross midnight (`closes_minute` up to 2880). A weekday with
 * no row means unknown, not closed: a closed day is stated with a row whose
 * `closed` flag is set.
 */
@Index('IDX_place_opening_hours_place', ['idPlace', 'weekday'])
@Check('CHK_place_opening_hours_weekday', '"weekday" BETWEEN 0 AND 6')
@Check(
  'CHK_place_opening_hours_interval',
  '"closed" = true OR ("opens_minute" >= 0 AND "opens_minute" < 1440 AND "closes_minute" > "opens_minute" AND "closes_minute" <= 2880)',
)
@Check(
  'CHK_place_opening_hours_source',
  `"source" IN ('OFFICIAL','SCHEMA_ORG','CURATED','USER')`,
)
@Entity('place_opening_hours')
export class PlaceOpeningHours extends BaseEntity {
  @Column({ name: 'id_place', type: 'integer' })
  idPlace: number;

  @ManyToOne(() => Place, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_place' })
  place: Place;

  @Column({ type: 'smallint' })
  weekday: number;

  @Column({ type: 'boolean', default: false })
  closed: boolean;

  @Column({ name: 'opens_minute', type: 'smallint', nullable: true })
  opensMinute: number | null;

  @Column({ name: 'closes_minute', type: 'smallint', nullable: true })
  closesMinute: number | null;

  @Column({ type: 'varchar', length: 20 })
  source: DurableHoursSource;

  @Column({ name: 'source_ref', type: 'varchar', length: 500, nullable: true })
  sourceRef: string | null;

  @Column({ name: 'verified_at', type: 'timestamptz' })
  verifiedAt: Date;

  /** After this the hours are stale: planning treats them as unknown. */
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;
}
