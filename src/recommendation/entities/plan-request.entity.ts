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
import { Department } from '../../places/entities/department.entity';
import { Plan } from '../../plans/entities/plan.entity';
import { User } from '../../users/entities/user.entity';
import { RequestStatus } from './request-status.entity';
import { PlanRequestCategory } from './plan-request-category.entity';
import { OutingType } from './outing-type.entity';

@Check('"budget" >= 0')
@Check('"available_duration" > 0')
@Entity('plan_request')
export class PlanRequest extends BaseEntity {
  @Index()
  @Column({ name: 'id_user', type: 'integer' })
  idUser: number;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_user' })
  user: User;

  @Column('numeric', {
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  budget: number;

  @Index()
  @Column({ name: 'id_department', type: 'integer' })
  idDepartment: number;

  @ManyToOne(() => Department, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'id_department' })
  department: Department;

  @Column({ name: 'available_duration', type: 'integer' })
  availableDuration: number;

  @Index()
  @Column({ name: 'requested_at', type: 'timestamptz' })
  requestedAt: Date;

  @Index()
  @Column({ name: 'id_outing_type', type: 'integer' })
  idOutingType: number;

  @ManyToOne(() => OutingType, (outingType) => outingType.planRequests, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_outing_type' })
  outingType: OutingType;

  @Index()
  @Column({ name: 'id_request_status', type: 'integer' })
  idRequestStatus: number;

  @ManyToOne(() => RequestStatus, (status) => status.planRequests, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_request_status' })
  status: RequestStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => Plan, (plan) => plan.request)
  plans: Plan[];

  @OneToMany(
    () => PlanRequestCategory,
    (requestCategory) => requestCategory.request,
  )
  categories: PlanRequestCategory[];
}
