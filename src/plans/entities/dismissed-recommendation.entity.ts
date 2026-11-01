import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { User } from '../../users/entities/user.entity';
import { Plan } from './plan.entity';

/**
 * A recommendation the user explicitly dismissed from the Home rail (CU21).
 *
 * One soft-deletable row per `(user, plan)` pair: a dismissed plan is filtered
 * out of `GET /plan-recommendations` for that user permanently. The short
 * "Deshacer" window on the client calls `DELETE`, which soft-removes the row
 * and lets the plan surface again.
 */
@Entity('dismissed_recommendation')
@Index('IDX_dismissed_recommendation_user_plan_unique', ['idUser', 'idPlan'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
export class DismissedRecommendation extends BaseEntity {
  @Index()
  @Column({ name: 'id_user', type: 'integer' })
  idUser: number;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_user' })
  user: User;

  @Index()
  @Column({ name: 'id_plan', type: 'integer' })
  idPlan: number;

  @ManyToOne(() => Plan, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_plan' })
  plan: Plan;
}
