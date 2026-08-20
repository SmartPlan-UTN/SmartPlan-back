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

/**
 * Parámetros con los que el user pide un plan (CU17, CU19, CU31).
 *
 * Se guarda como entity y no como un DTO de paso porque es la input del
 * motor de recomendación: CU21 ajusta las recommendationes "según history", y
 * ese history son las planRequests anteriores cruzadas con la
 * retroalimentación que dejó cada una.
 *
 * Las categorías pedidas van en `plan_request_category`, porque son varias.
 * La zona se expresa como un department y el tiempo available en minutos,
 * para que el motor pueda filtrar activities sin interpretar texto libre.
 *
 * > El diagrama list en esta clase un `id_plan_request`, que sería una key
 * > foránea a sí misma con el name de su propia key primaria, y por otro
 * > lado documenta que la request "se relaciona con user" sin mostrar la
 * > column. Acá se implementa esa relación como `id_user`: una request
 * > sin dueño no se puede listar en el history (PAN 13) ni usar para ajustar
 * > recommendationes.
 */
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

  /** Presupuesto available para la salida, en pesos. */
  @Column('numeric', {
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  budget: number;

  /** Zona elegida para la salida. */
  @Index()
  @Column({ name: 'id_department', type: 'integer' })
  idDepartment: number;

  @ManyToOne(() => Department, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'id_department' })
  department: Department;

  /** Tiempo máximo available para el plan, en minutos. */
  @Column({ name: 'available_duration', type: 'integer' })
  availableDuration: number;

  /** Cuándo se pidió el plan. Ordena el history del user (PAN 13). */
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

  /** Texto libre del user: "algo tranquilo", "cerca del centro". */
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
