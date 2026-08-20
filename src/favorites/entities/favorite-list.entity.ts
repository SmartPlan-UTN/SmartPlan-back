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

/**
 * Lista de guardado rápido de un user (CU15, CU39–CU43).
 *
 * Se crea junto con la cuenta: es la que recibe lo que se guarda con el
 * corazón, sin preguntar dónde. Las activities guardadas van en
 * `favorite_activity` y los plans en `favorite_plan`, en tablas separadas
 * porque son entities distintas y una sola table con dos claves foráneas
 * mutuamente excluyentes se rompe sola.
 */
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
