import { Check, Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import type { LicenseClass } from '../catalog.constants';

export type CatalogBatchStatus = 'running' | 'completed' | 'failed';

/** One run of the catalog import; the unit of traceability and rollback. */
@Index('IDX_catalog_import_batch_source', ['source'])
@Check(
  'CHK_catalog_import_batch_status',
  `"status" IN ('running','completed','failed')`,
)
@Entity('catalog_import_batch')
export class CatalogImportBatch extends BaseEntity {
  /** Provider or dataset the records came from (curated-csv, municipal...). */
  @Column({ type: 'varchar', length: 60 })
  source: string;

  @Column({ name: 'license_class', type: 'varchar', length: 20 })
  licenseClass: LicenseClass;

  @Column({ name: 'dry_run', type: 'boolean', default: false })
  dryRun: boolean;

  @Column({ type: 'varchar', length: 12, default: 'running' })
  status: CatalogBatchStatus;

  /** Hash of the input package, so the same input is recognisable. */
  @Column({ name: 'input_hash', type: 'varchar', length: 64, nullable: true })
  inputHash: string | null;

  @Column({ type: 'jsonb', nullable: true })
  stats: Record<string, number> | null;

  @Column({ name: 'version_number', type: 'integer', nullable: true })
  versionNumber: number | null;

  @Column({ name: 'started_at', type: 'timestamptz', default: () => 'now()' })
  startedAt: Date;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;
}
