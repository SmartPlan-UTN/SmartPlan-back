import { Entity, OneToMany } from 'typeorm';
import { CatalogEntity } from '../../common/entities/catalog-entity';
import { RolePermission } from './role-permission.entity';
import { User } from './user.entity';

/**
 * Role del sistema (CU57, CU62). Junto con `role_permission` define qué puede hacer
 * cada user.
 *
 * Valores previstos en la `key`: `user`, `admin`.
 */
@Entity('role')
export class Role extends CatalogEntity {
  @OneToMany(() => User, (user) => user.role)
  users: User[];

  @OneToMany(() => RolePermission, (rolePermission) => rolePermission.role)
  permissions: RolePermission[];
}
