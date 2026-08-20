import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { User } from '../../users/entities/user.entity';
import { FavoriteCollection } from './favorite-collection.entity';

/**
 * Agrupación de activities armada por el user (CU32–CU38): "Salidas con
 * los chicos", "Para el finde largo".
 *
 * Se diferencia de la list de favorites en la intención: la colección la
 * nombra y ordera el user, mientras que `favorite_list` es el guardado
 * rápido de una activity o un plan.
 *
 * El name es único por user para que dos collections no queden
 * indistinguibles en la pantalla.
 */
@Index(['idUser', 'nameCollection'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Entity('collection')
export class Collection extends BaseEntity {
  @Column({ name: 'id_user', type: 'integer' })
  idUser: number;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_user' })
  user: User;

  @Column({ name: 'name', type: 'varchar', length: 100 })
  nameCollection: string;

  /** Cuándo la creó el user. */
  @Column({ name: 'saved_at', type: 'timestamptz' })
  savedAt: Date;

  @OneToMany(() => FavoriteCollection, (favorite) => favorite.collection)
  activities: FavoriteCollection[];
}
