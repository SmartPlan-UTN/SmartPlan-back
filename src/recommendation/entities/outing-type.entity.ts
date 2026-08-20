import { Entity, OneToMany } from 'typeorm';
import { CatalogEntity } from '../../common/entities/catalog-entity';
import { PlanRequest } from './plan-request.entity';

/**
 * Tipo de salida que elige el user al pedir un plan: en couple, con friends,
 * en family, solo (CU17, CU19).
 *
 * Es una de las cinco entradas del objetivo general del sistema —budget,
 * ubicación, tiempo available, **type de salida** y preferences— y pondera
 * qué activities entran en el plan.
 *
 * > El name de esta clase quedó cortado en la exportación del diagrama; se la
 * > nombra por la key foránea que la referencia (`plan_request.id_outing_type`).
 */
@Entity('outing_type')
export class OutingType extends CatalogEntity {
  @OneToMany(() => PlanRequest, (request) => request.outingType)
  planRequests: PlanRequest[];
}
