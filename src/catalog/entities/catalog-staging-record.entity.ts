import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { CatalogImportBatch } from './catalog-import-batch.entity';

export type StagingEntityType = 'place' | 'activity';
export type StagingRecordStatus =
  | 'new'
  | 'updated'
  | 'unchanged'
  | 'needs_review'
  | 'rejected'
  | 'applied';

/**
 * A normalised record awaiting (or having completed) review. The payload is
 * validated against an allow-list: provider content that may not be stored
 * long-term can never reach this table.
 */
@Index(
  'IDX_catalog_staging_record_batch_key',
  ['idBatch', 'entityType', 'externalKey'],
  { unique: true, where: '"deleted_at" IS NULL' },
)
@Check(
  'CHK_catalog_staging_record_type',
  `"entity_type" IN ('place','activity')`,
)
@Check(
  'CHK_catalog_staging_record_status',
  `"status" IN ('new','updated','unchanged','needs_review','rejected','applied')`,
)
@Entity('catalog_staging_record')
export class CatalogStagingRecord extends BaseEntity {
  @Column({ name: 'id_batch', type: 'integer' })
  idBatch: number;

  @ManyToOne(() => CatalogImportBatch, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_batch' })
  batch: CatalogImportBatch;

  @Column({ name: 'entity_type', type: 'varchar', length: 12 })
  entityType: StagingEntityType;

  /** The record's stable identity in its source (its slug in curated data). */
  @Column({ name: 'external_key', type: 'varchar', length: 160 })
  externalKey: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ name: 'payload_hash', type: 'varchar', length: 64 })
  payloadHash: string;

  @Column({ type: 'varchar', length: 14, default: 'new' })
  status: StagingRecordStatus;

  /** Human-readable reasons: quality-gate failures, duplicate candidates... */
  @Column({ type: 'jsonb', nullable: true })
  notes: string[] | null;

  /** Id of the canonical row this record created or updated, once applied. */
  @Column({ name: 'applied_entity_id', type: 'integer', nullable: true })
  appliedEntityId: number | null;
}
