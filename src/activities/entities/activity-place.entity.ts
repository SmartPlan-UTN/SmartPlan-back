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

  /**
   * Where `latitude`/`longitude` came from. The link holds the effective
   * coordinates of its place: SmartPlan-owned ones (`OWNED`), or a copy of
   * the place's temporary Google cache (`GOOGLE_CACHE`) that expires with it
   * at `externalExpiresAt`. Google identity, rating and price live on the
   * place only.
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
