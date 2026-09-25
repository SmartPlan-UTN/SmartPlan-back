import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Category } from '../../categories/entities/category.entity';
import { BaseEntity } from '../../common/entities/base-entity';
import { PlanRequest } from './plan-request.entity';

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

  @Column({ type: 'text', nullable: true })
  description: string | null;
}
