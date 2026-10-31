import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { Place } from '../../places/entities/place.entity';
import type { PriceKind } from '../../common/pricing/price';

/**
 * One real, dated movie screening at a cinema, read from the cinema's own
 * published schedule (Schema.org ScreeningEvent). Dynamic inventory: it is
 * only plannable while it is in the future AND its observation is fresh
 * (`expires_at`); a schedule we have not re-read today is not trusted.
 */
@Entity('screening')
@Index('UQ_screening_source', ['idPlace', 'movieTitle', 'startsAt', 'room'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Index('IDX_screening_starts', ['startsAt'])
@Check(
  'CHK_screening_duration',
  '"duration_minutes" > 0 AND "duration_minutes" < 600',
)
export class Screening extends BaseEntity {
  /** The cinema (a Place of kind `cinema`). */
  @Column({ name: 'id_place', type: 'integer' })
  idPlace: number;

  @ManyToOne(() => Place, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_place' })
  place: Place;

  @Column({ name: 'movie_title', type: 'varchar', length: 200 })
  movieTitle: string;

  @Column({ name: 'duration_minutes', type: 'smallint' })
  durationMinutes: number;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt: Date;

  /** "2D", "3D", "Comfort + 2D", "2D + XD + Comfort"… as published. */
  @Column({ type: 'varchar', length: 60, nullable: true })
  format: string | null;

  /** "Subtitulada" / "Castellano" when the source states it. */
  @Column({ type: 'varchar', length: 30, nullable: true })
  language: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  room: string | null;

  @Column({
    name: 'price_kind',
    type: 'varchar',
    length: 12,
    default: 'UNKNOWN',
  })
  priceKind: PriceKind;

  @Column('numeric', {
    name: 'price_min',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: {
      to: (value: number | null) => value,
      from: (value: string | null) => (value === null ? null : Number(value)),
    },
  })
  priceMin: number | null;

  @Column({
    name: 'price_source_ref',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  priceSourceRef: string | null;

  /** Ticket purchase / detail page on the cinema's site. */
  @Column({ name: 'booking_url', type: 'varchar', length: 500, nullable: true })
  bookingUrl: string | null;

  @Column({ name: 'source_url', type: 'varchar', length: 500 })
  sourceUrl: string;

  @Column({ name: 'observed_at', type: 'timestamptz' })
  observedAt: Date;

  /** After this the observation is stale (re-read the schedule). */
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;
}
