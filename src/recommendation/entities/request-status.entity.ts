import { Entity, OneToMany } from 'typeorm';
import { CatalogEntity } from '../../common/entities/catalog-entity';
import { PlanRequest } from './plan-request.entity';

/**
 * Status de una request de plan (CU17, CU19, CU31).
 *
 * La generación de un plan no se resuelve dentro del request: se publica en la
 * queue y la responden los workers después de queryr Google Maps y Gemini.
 * Esta table es la que le permite al frontend preguntar en qué anda la
 * request que envió.
 *
 * Valores previstos en la `key`: `pending`, `processing`, `generated`,
 * `failed`.
 */
@Entity('request_status')
export class RequestStatus extends CatalogEntity {
  @OneToMany(() => PlanRequest, (request) => request.status)
  planRequests: PlanRequest[];
}
