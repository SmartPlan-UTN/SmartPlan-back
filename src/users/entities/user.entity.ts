import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { Plan } from '../../plans/entities/plan.entity';
import { UserStatus } from './user-status.entity';
import { UserPreference } from './user-preference.entity';
import { Role } from './role.entity';

@Entity('user')
export class User extends BaseEntity {
  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ name: 'last_name', type: 'varchar', length: 80 })
  lastName: string;

  @Index('IDX_user_email_unique', { unique: true })
  @Column({ type: 'varchar', length: 150 })
  email: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    select: false,
  })
  passwordHash: string;

  @Index()
  @Column({ name: 'id_role', type: 'integer' })
  idRole: number;

  @ManyToOne(() => Role, (role) => role.users, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_role' })
  role: Role;

  @Index()
  @Column({ name: 'id_user_status', type: 'integer' })
  idUserStatus: number;

  @ManyToOne(() => UserStatus, (status) => status.users, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_user_status' })
  status: UserStatus;

  @OneToMany(() => UserPreference, (preference) => preference.user)
  preferences: UserPreference[];

  @OneToMany(() => Plan, (plan) => plan.user)
  plans: Plan[];
}
