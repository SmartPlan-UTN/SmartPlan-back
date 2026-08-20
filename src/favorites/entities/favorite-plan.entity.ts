import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { Plan } from '../../plans/entities/plan.entity';
import { FavoriteList } from './favorite-list.entity';

/**
 * Plan guardado por un user (CU40, CU42, CU43). Resuelve la relación N:M
 * entre {@link FavoriteList} y {@link Plan}.
 *
 * Mismo criterio que `favorite_activity`: el par list–plan es único.
 */
@Index(['idFavoriteList', 'idPlan'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Entity('favorite_plan')
export class FavoritePlan extends BaseEntity {
  @Column({ name: 'id_favorite_list', type: 'integer' })
  idFavoriteList: number;

  @ManyToOne(() => FavoriteList, (list) => list.plans, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_favorite_list' })
  list: FavoriteList;

  @Index()
  @Column({ name: 'id_plan', type: 'integer' })
  idPlan: number;

  @ManyToOne(() => Plan, (plan) => plan.favorites, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_plan' })
  plan: Plan;
}
