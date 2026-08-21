import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';

export enum AuditAction {
  Create = 'create',
  Update = 'update',
  Delete = 'delete',
  StartSession = 'start_session',
  EndSession = 'end_session',
}

@Index(['affectedEntity', 'affectedEntityId'])
@Entity('audit_log')
export class AuditLog extends BaseEntity {
  @Index()
  @Column({ type: 'enum', enum: AuditAction })
  action: AuditAction;

  @Column({ name: 'affected_entity', type: 'varchar', length: 60 })
  affectedEntity: string;

  @Column({ name: 'id_affected_entity', type: 'integer' })
  affectedEntityId: number;

  @Column({ type: 'jsonb', nullable: true })
  original: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  changes: Record<string, unknown> | null;
}
