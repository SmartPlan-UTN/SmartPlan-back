import { Entity, OneToMany } from 'typeorm';
import { CatalogEntity } from '../../common/entities/catalog-entity';
import { PlanRequest } from './plan-request.entity';

@Entity('outing_type')
export class OutingType extends CatalogEntity {
  @OneToMany(() => PlanRequest, (request) => request.outingType)
  planRequests: PlanRequest[];
}
