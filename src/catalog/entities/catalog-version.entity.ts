import { Check, Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';

export type CatalogVersionStatus = 'draft' | 'validated' | 'promoted';

/**
 * A promoted, content-hashed state of the canonical catalog. Staging and
 * production keep separate databases; what moves between them is a version
 * package with this manifest hash.
 */
@Index('IDX_catalog_version_number', ['number'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Check(
  'CHK_catalog_version_status',
  `"status" IN ('draft','validated','promoted')`,
)
@Entity('catalog_version')
export class CatalogVersion extends BaseEntity {
  @Column({ type: 'integer' })
  number: number;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 12, default: 'draft' })
  status: CatalogVersionStatus;

  /** SHA-256 of the canonical package content (not of its file envelope). */
  @Column({ name: 'content_hash', type: 'varchar', length: 64, nullable: true })
  contentHash: string | null;

  @Column({ type: 'jsonb', nullable: true })
  counts: Record<string, number> | null;

  @Column({ name: 'parent_number', type: 'integer', nullable: true })
  parentNumber: number | null;

  @Column({ name: 'promoted_at', type: 'timestamptz', nullable: true })
  promotedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
