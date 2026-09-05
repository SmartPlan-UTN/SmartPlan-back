import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { Permission } from './permission.entity';
import { Role } from './role.entity';

@Index(['idRole', 'idPermission'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Entity('role_permission')
export class RolePermission extends BaseEntity {
  @Column({ name: 'id_role', type: 'integer' })
  idRole: number;

  @ManyToOne(() => Role, (role) => role.permissions, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_role' })
  role: Role;

  @Index()
  @Column({ name: 'id_permission', type: 'integer' })
  idPermission: number;

  @ManyToOne(() => Permission, (permission) => permission.roles, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_permission' })
  permission: Permission;
}
