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
import { FavoriteActivity } from './favorite-activity.entity';
import { FavoritePlan } from './favorite-plan.entity';

@Entity('favorite_list')
export class FavoriteList extends BaseEntity {
  @Index({ unique: true, where: '"deleted_at" IS NULL' })
  @Column({ name: 'id_user', type: 'integer' })
  idUser: number;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_user' })
  user: User;

  @OneToMany(() => FavoriteActivity, (favorite) => favorite.list)
  activities: FavoriteActivity[];

  @OneToMany(() => FavoritePlan, (favorite) => favorite.list)
  plans: FavoritePlan[];
}
