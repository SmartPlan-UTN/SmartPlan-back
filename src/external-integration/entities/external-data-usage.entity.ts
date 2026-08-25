import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { ExternalProvider } from './external-provider.entity';

@Entity('external_data_usage')
export class ExternalDataUsage extends BaseEntity {
  @Index()
  @Column({ name: 'id_external_provider', type: 'integer' })
  idExternalProvider: number;

  @ManyToOne(() => ExternalProvider, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_external_provider' })
  provider: ExternalProvider;

  @Column({ name: 'external_reference', type: 'varchar', length: 255 })
  externalReference: string;

  @Column({ type: 'varchar', length: 60 })
  context: string;

  @Column({ name: 'used_at', type: 'timestamptz' })
  usedAt: Date;
}
