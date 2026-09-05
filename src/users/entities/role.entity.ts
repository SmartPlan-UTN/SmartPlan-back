import { Entity, OneToMany } from 'typeorm';
import { CatalogEntity } from '../../common/entities/catalog-entity';
import { RolePermission } from './role-permission.entity';
import { User } from './user.entity';

@Entity('role')
export class Role extends CatalogEntity {
  @OneToMany(() => User, (user) => user.role)
  users: User[];

  @OneToMany(() => RolePermission, (rolePermission) => rolePermission.role)
  permissions: RolePermission[];
}
