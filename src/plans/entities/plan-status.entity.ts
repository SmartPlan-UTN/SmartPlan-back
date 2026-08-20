import { Entity, OneToMany } from 'typeorm';
import { CatalogEntity } from '../../common/entities/catalog-entity';
import { Plan } from './plan.entity';

/**
 * Status de un plan (CU22, CU26, CU60).
 *
 * Tiene la forma común de los catálogos: `name`, `key` y `description`.
 *
 * Valores previstos en la `key`: `generated` (lo devolvió el motor y el user
 * todavía no lo eligió), `selected` (CU22), `confirmed`, `completed` (ya
 * pasó: habilita la retroalimentación de CU23) y `cancelled`.
 */
@Entity('plan_status')
export class PlanStatus extends CatalogEntity {
  @OneToMany(() => Plan, (plan) => plan.status)
  plans: Plan[];
}
