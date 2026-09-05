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

  @Column({ name: 'description', type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Column({ name: 'saved_at', type: 'timestamptz' })
  savedAt: Date;

  @OneToMany(() => FavoriteCollection, (favorite) => favorite.collection)
  activities: FavoriteCollection[];
}
