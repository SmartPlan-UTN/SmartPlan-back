import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { decimalTransformer } from '../../common/typeorm/decimal-transformer';
import { FavoritePlan } from '../../favorites/entities/favorite-plan.entity';
import { PlanRequest } from '../../recommendation/entities/plan-request.entity';
import { User } from '../../users/entities/user.entity';
import { PlanDetail } from './plan-detail.entity';
import { PlanStatus } from './plan-status.entity';

/**
 * Conjunto orderado de activities que conforma una experiencia social
 * (CU12, CU13, CU17, CU24–CU31, CU60).
 *
 * Es la entity central del sistema: la genera el motor a partir de una
 * `plan_request` o la arma el user a mano (CU24), y sus ítems están en
 * `plan_detail`.
 *
 * Todo plan tiene un dueño explícito. Los generados también conservan la
 * request que los originó; los creados a mano (CU24) dejan esa relación nula.
 */
@Check('"estimated_total_cost" >= 0')
@Check('"estimated_total_duration" >= 0')
@Entity('plan')
export class Plan extends BaseEntity {
  @Column({ type: 'varchar', length: 150 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Index()
  @Column({ name: 'id_user', type: 'integer' })
  idUser: number;

  @ManyToOne(() => User, (user) => user.plans, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_user' })
  user: User;

  @Index()
  @Column({ name: 'id_plan_request', type: 'integer', nullable: true })
  idPlanRequest: number | null;

  /** Nula en los plans creados a mano (CU24), que no salen de una request. */
  @ManyToOne(() => PlanRequest, (request) => request.plans, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'id_plan_request' })
  request: PlanRequest | null;

  @Index()
  @Column({ name: 'id_plan_status', type: 'integer' })
  idPlanStatus: number;

  @ManyToOne(() => PlanStatus, (status) => status.plans, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_plan_status' })
  status: PlanStatus;

  /**
   * Costo total (CU30) y duración total, desnormalizados desde `plan_detail`.
   *
   * Se guardan en place de calcularse en cada query porque el listado de
   * plans los muestra en cada tarjeta: recalcularlos obligaría a sumar los
   * details de todos los plans de la página. Los recalcula el service de
   * plans cada vez que se agrega o se quita una activity (CU27, CU28).
   */
  @Column('numeric', {
    name: 'estimated_total_cost',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  estimatedTotalCost: number;

  /** En minutos. */
  @Column({ name: 'estimated_total_duration', type: 'integer', default: 0 })
  estimatedTotalDuration: number;

  @OneToMany(() => PlanDetail, (detail) => detail.plan)
  details: PlanDetail[];

  @OneToMany(() => FavoritePlan, (favorite) => favorite.plan)
  favorites: FavoritePlan[];
}
