import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { decimalTransformer } from '../../common/typeorm/decimal-transformer';
import { Place } from '../../places/entities/place.entity';
import { Activity } from './activity.entity';

/**
 * Dónde se hace una activity (CU14, CU16, CU50). Resuelve la relación N:M
 * entre {@link Activity} y {@link Place} y agrega el punto exacto en el mapa.
 *
 * Es N:M y no un `id_place` en `activity` porque la misma experiencia puede
 * ofrecerse en varias sucursales o puntos de encuentro, y un mismo place
 * alberga varias activities.
 *
 * Las coordinates viven acá y no en `place` porque son las del punto de
 * encuentro de esa activity concreta: la input de la bodega no es la misma
 * que el sector de la degustación.
 */
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

  /**
   * Latitud y longitude en grados decimales.
   *
   * Van como `numeric(9,6)` y no como `float`: la búsqueda en mapa (CU16)
   * filtra por un rectángulo de coordinates y `numeric` compara exacto. Seis
   * decimales ubican un punto con un error de ~11 cm, de sobra para un local.
   *
   * Van indexadas juntas por esa misma query.
   */
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

  /** Aclaración del punto de encuentro, cuando la dirección no alcanza. */
  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
