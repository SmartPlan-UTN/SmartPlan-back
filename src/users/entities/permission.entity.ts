import { Entity, OneToMany } from 'typeorm';
import { CatalogEntity } from '../../common/entities/catalog-entity';
import { RolePermission } from './role-permission.entity';

/**
 * Permission concreto envelope un resource del sistema (CU61).
 *
 * La `key` es lo que chequea el guard de autorización, con el formato
 * `resource.action`: `activity.create`, `rating.moderar`, `user.list`.
 */
@Entity('permission')
export class Permission extends CatalogEntity {
  @OneToMany(
    () => RolePermission,
    (rolePermission) => rolePermission.permission,
  )
  roles: RolePermission[];
}
