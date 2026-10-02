import { Entity, OneToMany } from 'typeorm';
import { CatalogEntity } from '../../common/entities/catalog-entity';
import { Plan } from './plan.entity';

@Entity('plan_status')
export class PlanStatus extends CatalogEntity {
  @OneToMany(() => Plan, (plan) => plan.status)
  plans: Plan[];
}
