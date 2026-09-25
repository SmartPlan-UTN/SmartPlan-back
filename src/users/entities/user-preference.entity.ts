import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Category } from '../../categories/entities/category.entity';
import { BaseEntity } from '../../common/entities/base-entity';
import { User } from './user.entity';

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
