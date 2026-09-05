import { Entity, OneToMany } from 'typeorm';
import { CatalogEntity } from '../../common/entities/catalog-entity';
import { Category } from './category.entity';

@Entity('category_status')
export class CategoryStatus extends CatalogEntity {
  @OneToMany(() => Category, (category) => category.status)
  categories: Category[];
}
