import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { ExternalProvider } from './external-provider.entity';

@Check('"record_count" >= 0')
@Entity('external_sync')
export class ExternalSync extends BaseEntity {
  @Index()
  @Column({ name: 'id_external_provider', type: 'integer' })
  idExternalProvider: number;

  @ManyToOne(() => ExternalProvider, (provider) => provider.syncs, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_external_provider' })
  provider: ExternalProvider;

  @Column({ type: 'varchar', length: 60 })
  entity: string;

  @Index()
  @Column({ type: 'varchar', length: 30 })
  status: string;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  @Column({ name: 'record_count', type: 'integer', default: 0 })
  recordCount: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;
}
