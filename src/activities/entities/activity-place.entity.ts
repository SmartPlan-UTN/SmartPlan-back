import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { decimalTransformer } from '../../common/typeorm/decimal-transformer';
import { Place } from '../../places/entities/place.entity';
import type { CoordinateSource } from '../../catalog/catalog.constants';
import { Activity } from './activity.entity';

@Index(['idActivity', 'idPlace'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Index(['latitude', 'longitude'])
@Check('"latitude" IS NULL OR "latitude" BETWEEN -90 AND 90')
@Check('"longitude" IS NULL OR "longitude" BETWEEN -180 AND 180')
@Check(
  '("latitude" IS NULL AND "longitude" IS NULL) OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL)',
)
@Check('"external_rating" IS NULL OR "external_rating" BETWEEN 0 AND 5')
@Check(
  '("external_rating" IS NULL AND "external_rating_count" IS NULL) OR ("external_rating" IS NOT NULL AND "external_rating_count" IS NOT NULL)',
)
@Check(
  '"external_price_min" IS NULL OR "external_price_max" IS NULL OR "external_price_min" <= "external_price_max"',
)
@Entity('activity_place')
export class ActivityPlace extends BaseEntity {
  @Column({ name: 'id_activity', type: 'integer' })
  idActivity: number;

  @ManyToOne(() => Activity, (activity) => activity.places, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_activity' })
  activity: Activity;

  @Index()
  @Column({ name: 'id_place', type: 'integer' })
  idPlace: number;

  @ManyToOne(() => Place, (place) => place.activities, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_place' })
  place: Place;

  @Column('numeric', {
    precision: 9,
    scale: 6,
    nullable: true,
    transformer: decimalTransformer,
  })
  latitude: number | null;

  @Column('numeric', {
    precision: 9,
    scale: 6,
    nullable: true,
    transformer: decimalTransformer,
  })
  longitude: number | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Index()
  @Column({
    name: 'google_place_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  googlePlaceId: string | null;

  @Column({
    name: 'external_rating',
    type: 'numeric',
    precision: 2,
    scale: 1,
    nullable: true,
    transformer: decimalTransformer,
  })
  externalRating: number | null;

  @Column({
    name: 'external_rating_count',
    type: 'integer',
    nullable: true,
  })
  externalRatingCount: number | null;

  /**
   * Temporary Google cache of the PLACE's price range/level (same expiry as
   * the rating). It describes the venue, not a specific activity, and is never
   * promoted to the activity's own price nor exported.
   */
  @Column({
    name: 'external_price_min',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  externalPriceMin: number | null;

  @Column({
    name: 'external_price_max',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  externalPriceMax: number | null;

  @Column({
    name: 'external_price_currency',
    type: 'varchar',
    length: 3,
    nullable: true,
  })
  externalPriceCurrency: string | null;

  @Column({
    name: 'external_price_level',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  externalPriceLevel: string | null;

  /**
   * Where `latitude`/`longitude` came from. `GOOGLE_CACHE` values are a
   * temporary provider cache that expires at `externalExpiresAt`.
   */
  @Column({
    name: 'coordinates_source',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  coordinatesSource: CoordinateSource | null;

  @Column({ name: 'external_fetched_at', type: 'timestamptz', nullable: true })
  externalFetchedAt: Date | null;

  /** Cached Google content must be purged at or before this instant. */
  @Column({ name: 'external_expires_at', type: 'timestamptz', nullable: true })
  externalExpiresAt: Date | null;
}
