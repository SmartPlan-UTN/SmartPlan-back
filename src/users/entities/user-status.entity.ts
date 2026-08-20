import { Entity, OneToMany } from 'typeorm';
import { CatalogEntity } from '../../common/entities/catalog-entity';
import { User } from './user.entity';

/**
 * Status de la cuenta de un user (CU2, CU7, CU57).
 *
 * Valores previstos en la `key`: `active`, `suspended`, `banned`. Son los
 * tres que filtra el reporte REP-02 (Administración de Users).
 */
@Entity('user_status')
export class UserStatus extends CatalogEntity {
  @OneToMany(() => User, (user) => user.status)
  users: User[];
}
