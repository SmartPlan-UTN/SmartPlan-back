import { Entity, OneToMany } from 'typeorm';
import { CatalogEntity } from '../../common/entities/catalog-entity';
import { PlanRequest } from './plan-request.entity';

@Entity('request_status')
export class RequestStatus extends CatalogEntity {
  @OneToMany(() => PlanRequest, (request) => request.status)
  planRequests: PlanRequest[];
}
