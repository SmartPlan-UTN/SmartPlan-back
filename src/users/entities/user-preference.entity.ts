import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Category } from '../../categories/entities/category.entity';
import { BaseEntity } from '../../common/entities/base-entity';
import { User } from './user.entity';

/**
 * Categorías que le interesan a un user (CU8, CU18, CU21). Resuelve la
 * relación N:M entre {@link User} y {@link Category}.
 *
 * Es lo que pondera el motor de recomendación al armar un plan, y lo que ajusta
 * CU21 a partir de la retroalimentación.
 *
 * Los parámetros de una salida puntual (budget, zona, tiempo available)
 * **no** viven acá: son de la request, no del profile, y van en
 * `plan_request`.
 */
@Index(['idUser', 'idCategory'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Entity('user_preference')
export class UserPreference extends BaseEntity {
  @Column({ name: 'id_user', type: 'integer' })
  idUser: number;

  @ManyToOne(() => User, (user) => user.preferences, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_user' })
  user: User;

  @Index()
  @Column({ name: 'id_category', type: 'integer' })
  idCategory: number;

  @ManyToOne(() => Category, (category) => category.preferences, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_category' })
  category: Category;
}
