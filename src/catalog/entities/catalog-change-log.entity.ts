import { Check, Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';

/** What an import did to a canonical row, with enough data to undo it. */
@Index('IDX_catalog_change_log_batch', ['idBatch'])
@Index('IDX_catalog_change_log_entity', ['entityType', 'entityId'])
@Check(
  'CHK_catalog_change_log_operation',
  `"operation" IN ('create','update','archive')`,
)
@Entity('catalog_change_log')
export class CatalogChangeLog extends BaseEntity {
  @Column({ name: 'id_batch', type: 'integer' })
  idBatch: number;

  @Column({ name: 'entity_type', type: 'varchar', length: 12 })
  entityType: 'place' | 'activity';

  @Column({ name: 'entity_id', type: 'integer' })
  entityId: number;

  @Column({ type: 'varchar', length: 10 })
  operation: 'create' | 'update' | 'archive';

  /** Allow-listed canonical fields before the change (null on create). */
  @Column({ type: 'jsonb', nullable: true })
  before: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  after: Record<string, unknown> | null;
}
