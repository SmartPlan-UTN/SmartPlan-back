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

/**
 * User del sistema (CU2, CU5, CU6, CU7, CU57).
 *
 * El `email` es la credencial de acceso: es único y está indexado porque es la
 * búsqueda que corre en cada login (CU1).
 *
 * > El diagrama muestra además un `id_preference` en esta clase, pero no hay
 * > ninguna table `preference` a la que pueda apuntar: las preferences son
 * > una relación N:M entre `user` y `category` resuelta por
 * > `user_preference`, que ya tiene su propio `id_user`. Se omite para
 * > no crear una key foránea sin destination.
 */
@Entity('user')
export class User extends BaseEntity {
  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ name: 'last_name', type: 'varchar', length: 80 })
  lastName: string;

  @Index({ unique: true, where: '"deleted_at" IS NULL' })
  @Column({ type: 'varchar', length: 150 })
  email: string;

  /**
   * Hash de la contraseña (bcrypt o argon2), **nunca** el texto plano.
   *
   * `select: false` la deja afuera de todo `find` que no la pida explícitamente
   * con `addSelect`, así que una query distraída no puede terminar
   * devolviéndola en una response de la API.
   */
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
