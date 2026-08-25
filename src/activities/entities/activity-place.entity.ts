import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { decimalTransformer } from '../../common/typeorm/decimal-transformer';
import { Place } from '../../places/entities/place.entity';
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

  @Index()
  @Column({
    name: 'google_place_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  googlePlaceId: string | null;
}
