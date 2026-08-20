import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Category } from '../../categories/entities/category.entity';
import { BaseEntity } from '../../common/entities/base-entity';
import { PlanRequest } from './plan-request.entity';

/**
 * Categorías que el user pidió para una salida (CU17, CU19). Resuelve la
 * relación N:M entre {@link PlanRequest} y {@link Category}.
 *
 * Es distinta de `user_preference`: la preference es del profile y vale
 * para siempre; esto es lo que se pidió esta vez, que puede no tener nada que
 * ver con lo de siempre.
 */
@Index(['idPlanRequest', 'idCategory'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Entity('plan_request_category')
export class PlanRequestCategory extends BaseEntity {
  @Column({ name: 'id_plan_request', type: 'integer' })
  idPlanRequest: number;

  @ManyToOne(() => PlanRequest, (request) => request.categories, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_plan_request' })
  request: PlanRequest;

  @Index()
  @Column({ name: 'id_category', type: 'integer' })
  idCategory: number;

  @ManyToOne(() => Category, (category) => category.planRequests, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_category' })
  category: Category;

  /** Aclaración del user envelope esa categoría en particular. */
  @Column({ type: 'text', nullable: true })
  description: string | null;
}
