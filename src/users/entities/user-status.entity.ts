import { Entity, OneToMany } from 'typeorm';
import { CatalogEntity } from '../../common/entities/catalog-entity';
import { User } from './user.entity';

@Entity('user_status')
export class UserStatus extends CatalogEntity {
  @OneToMany(() => User, (user) => user.status)
  users: User[];
}
