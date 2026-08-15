import { Entity, OneToMany } from 'typeorm';
import { EntidadCatalogo } from '../../common/entidades/entidad-catalogo';
import { Categoria } from './categoria.entity';

/**
 * Estado de una categoría del catálogo (CU54).
 *
 * Valores previstos en la `key`: `activa`, `inactiva`. Una categoría inactiva
 * deja de ofrecerse en los filtros de búsqueda (CU10) y de pesar en la
 * recomendación, pero sigue existiendo para las actividades que ya la tienen
 * asignada.
 */
@Entity('estado_categoria')
export class EstadoCategoria extends EntidadCatalogo {
  @OneToMany(() => Categoria, (categoria) => categoria.estado)
  categorias: Categoria[];
}
