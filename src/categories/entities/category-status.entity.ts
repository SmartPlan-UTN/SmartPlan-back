import { Entity, OneToMany } from 'typeorm';
import { CatalogEntity } from '../../common/entities/catalog-entity';
import { Category } from './category.entity';

/**
 * Status de una categoría del catálogo (CU54).
 *
 * Valores previstos en la `key`: `active`, `inactive`. Una categoría inactive
 * deja de ofrecerse en los filtros de búsqueda (CU10) y de pesar en la
 * recomendación, pero sigue existiendo para las activities que ya la tienen
 * asignada.
 */
@Entity('category_status')
export class CategoryStatus extends CatalogEntity {
  @OneToMany(() => Category, (category) => category.status)
  categories: Category[];
}
