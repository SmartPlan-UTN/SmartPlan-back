import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { User } from '../../users/entities/user.entity';

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

  @Index()
  @Column({ name: 'id_actor', type: 'integer', nullable: true })
  idActor: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'id_actor' })
  actor: User | null;

  @Column({ name: 'affected_entity', type: 'varchar', length: 60 })
  affectedEntity: string;

  @Column({ name: 'id_affected_entity', type: 'integer' })
  affectedEntityId: number;

  @Column({ type: 'jsonb', nullable: true })
  original: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  changes: Record<string, unknown> | null;
}
