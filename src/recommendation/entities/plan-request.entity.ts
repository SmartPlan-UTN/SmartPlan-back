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

export enum PlanRequestMode {
  Automatic = 'automatic',
  Surprise = 'surprise',
}

@Check('"budget" IS NULL OR "budget" >= 0')
@Check('"available_duration" IS NULL OR "available_duration" > 0')
@Entity('plan_request')
export class PlanRequest extends BaseEntity {
  @Index()
  @Column({ name: 'id_user', type: 'integer' })
  idUser: number;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_user' })
  user: User;

  @Column({ type: 'enum', enum: PlanRequestMode })
  mode: PlanRequestMode;

  @Column({ name: 'raw_query', type: 'text', nullable: true })
  rawQuery: string | null;

  @Column({ name: 'raw_context', type: 'jsonb', nullable: true })
  rawContext: Record<string, unknown> | null;

  @Column('numeric', {
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  budget: number | null;

  @Index()
  @Column({ name: 'id_department', type: 'integer', nullable: true })
  idDepartment: number | null;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'id_department' })
  department: Department | null;

  @Column({ name: 'available_duration', type: 'integer', nullable: true })
  availableDuration: number | null;

  @Index()
  @Column({ name: 'requested_at', type: 'timestamptz' })
  requestedAt: Date;

  @Index()
  @Column({ name: 'id_outing_type', type: 'integer', nullable: true })
  idOutingType: number | null;

  @ManyToOne(() => OutingType, (outingType) => outingType.planRequests, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_outing_type' })
  outingType: OutingType | null;

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

  @Column({ name: 'intent_resolved_at', type: 'timestamptz', nullable: true })
  intentResolvedAt: Date | null;

  @Column({
    name: 'processing_started_at',
    type: 'timestamptz',
    nullable: true,
  })
  processingStartedAt: Date | null;

  @Column({
    name: 'recovery_attempts',
    type: 'smallint',
    default: 0,
  })
  recoveryAttempts: number;

  @Column({
    name: 'recovery_claimed_at',
    type: 'timestamptz',
    nullable: true,
  })
  recoveryClaimedAt: Date | null;

  @Column({ name: 'failure_code', type: 'varchar', length: 60, nullable: true })
  failureCode: string | null;

  @Column({ name: 'failure_detail', type: 'jsonb', nullable: true })
  failureDetail: Record<string, unknown> | null;

  @Column({ name: 'failed_at', type: 'timestamptz', nullable: true })
  failedAt: Date | null;

  @OneToMany(() => Plan, (plan) => plan.request)
  plans: Plan[];

  @OneToMany(
    () => PlanRequestCategory,
    (requestCategory) => requestCategory.request,
  )
  categories: PlanRequestCategory[];
}
