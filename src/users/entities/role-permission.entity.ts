import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { Permission } from './permission.entity';
import { Role } from './role.entity';

/**
 * Permissions asignados a cada role (CU61). Resuelve la relación N:M entre
 * {@link Role} y {@link Permission}.
 *
 * Se declara como entity propia y no como un `@ManyToMany` implícito porque el
 * diagrama la nombra y porque una asignación de permissions es en sí misma un dato
 * auditable: interesa cuándo se otorgó y poder darla de baja sin borrarla.
 *
 * El par role–permission es único: asignar dos veces el mismo permission no debería
 * dejar dos filas.
 */
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
