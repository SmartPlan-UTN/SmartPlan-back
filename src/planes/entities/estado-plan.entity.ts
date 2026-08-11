import { Entity, OneToMany } from 'typeorm';
import { EntidadCatalogo } from '../../common/entidades/entidad-catalogo';
import { Plan } from './plan.entity';

/**
 * Estado de un plan (CU22, CU26, CU60).
 *
 * Los atributos de esta clase quedaron cortados en la exportación del diagrama;
 * se le aplica la forma común de los catálogos (`nombre`, `key`, `descripcion`),
 * que es la que repiten el resto de las tablas de estado.
 *
 * Valores previstos en la `key`: `generado` (lo devolvió el motor y el usuario
 * todavía no lo eligió), `seleccionado` (CU22), `confirmado`, `finalizado` (ya
 * pasó: habilita la retroalimentación de CU23) y `cancelado`.
 */
@Entity('estado_plan')
export class EstadoPlan extends EntidadCatalogo {
  @OneToMany(() => Plan, (plan) => plan.estado)
  planes: Plan[];
}
