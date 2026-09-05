import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Activity } from '../../activities/entities/activity.entity';
import { BaseEntity } from '../../common/entities/base-entity';
import { FavoriteList } from './favorite-list.entity';

@Index(['idFavoriteList', 'idActivity'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Entity('favorite_activity')
export class FavoriteActivity extends BaseEntity {
  @Column({ name: 'id_favorite_list', type: 'integer' })
  idFavoriteList: number;

  @ManyToOne(() => FavoriteList, (list) => list.activities, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_favorite_list' })
  list: FavoriteList;

  @Index()
  @Column({ name: 'id_activity', type: 'integer' })
  idActivity: number;

  @ManyToOne(() => Activity, (activity) => activity.favorites, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_activity' })
  activity: Activity;
}
