import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Activity } from '../../activities/entities/activity.entity';
import { BaseEntity } from '../../common/entities/base-entity';
import { decimalTransformer } from '../../common/typeorm/decimal-transformer';
import { Plan } from './plan.entity';

@Index(['idPlan', 'order'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Index(['idPlan', 'idActivity'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Check('"order" > 0')
@Check('"estimated_cost" >= 0')
@Check('"estimated_duration" >= 0')
@Entity('plan_detail')
export class PlanDetail extends BaseEntity {
  @Column({ name: 'id_plan', type: 'integer' })
  idPlan: number;

  @ManyToOne(() => Plan, (plan) => plan.details, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_plan' })
  plan: Plan;

  @Index()
  @Column({ name: 'id_activity', type: 'integer' })
  idActivity: number;

  @ManyToOne(() => Activity, (activity) => activity.planDetails, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_activity' })
  activity: Activity;

  @Column({ type: 'smallint' })
  order: number;

  @Column('numeric', {
    name: 'estimated_cost',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  estimatedCost: number;

  @Column({ name: 'estimated_duration', type: 'integer', default: 0 })
  estimatedDuration: number;

  @Column({ type: 'text', nullable: true })
  note: string | null;
}
