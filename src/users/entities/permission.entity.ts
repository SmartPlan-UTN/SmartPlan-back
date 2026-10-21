import { Entity, OneToMany } from 'typeorm';
import { CatalogEntity } from '../../common/entities/catalog-entity';
import { RolePermission } from './role-permission.entity';

@Entity('permission')
export class Permission extends CatalogEntity {
  @OneToMany(
    () => RolePermission,
    (rolePermission) => rolePermission.permission,
  )
  roles: RolePermission[];
}
