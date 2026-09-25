import { Column, Entity, OneToMany } from 'typeorm';
import { CatalogEntity } from '../../common/entities/catalog-entity';
import { ExternalSync } from './external-sync.entity';

@Entity('external_provider')
export class ExternalProvider extends CatalogEntity {
  @Column({ type: 'boolean', default: true })
  active: boolean;

  @OneToMany(() => ExternalSync, (sync) => sync.provider)
  syncs: ExternalSync[];
}
