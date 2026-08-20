import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Activity } from '../../activities/entities/activity.entity';
import { BaseEntity } from '../../common/entities/base-entity';
import { Collection } from './collection.entity';

/**
 * Activity agregada a una colección (CU35–CU37). Resuelve la relación N:M
 * entre {@link Collection} y {@link Activity}, y agrega el order con el que el
 * user las acomodó.
 *
 * El par colección–activity es único: agregar dos veces la misma activity no
 * duplica la fila.
 */
@Index(['idCollection', 'idActivity'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Check('"order" IS NULL OR "order" > 0')
@Entity('favorite_collection')
export class FavoriteCollection extends BaseEntity {
  @Column({ name: 'id_collection', type: 'integer' })
  idCollection: number;

  @ManyToOne(() => Collection, (collection) => collection.activities, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_collection' })
  collection: Collection;

  @Index()
  @Column({ name: 'id_activity', type: 'integer' })
  idActivity: number;

  @ManyToOne(() => Activity, (activity) => activity.collections, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_activity' })
  activity: Activity;

  /** Posición dentro de la colección, orderada por el user. */
  @Column({ type: 'smallint', nullable: true })
  order: number | null;
}
