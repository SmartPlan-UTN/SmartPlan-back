import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { User } from '../../users/entities/user.entity';
import { Plan } from './plan.entity';

@Entity('plan_intention')
@Index('IDX_plan_intention_user_plan_unique', ['idUser', 'idPlan'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
export class PlanIntention extends BaseEntity {
  @Index()
  @Column({ name: 'id_user', type: 'integer' })
  idUser: number;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_user' })
  user: User;

  @Index()
  @Column({ name: 'id_plan', type: 'integer' })
  idPlan: number;

  @ManyToOne(() => Plan, (plan) => plan.intentions, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_plan' })
  plan: Plan;
}
