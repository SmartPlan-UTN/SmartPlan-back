import { Check, Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import type { LicenseClass } from '../catalog.constants';

/**
 * Which external identity a canonical row corresponds to. A Google `place_id`
 * is an identity link only (PROVIDER_ID_ONLY): it carries no provider content.
 */
@Index('IDX_entity_source_link_entity', ['entityType', 'entityId'])
@Index(
  'IDX_entity_source_link_external',
  ['entityType', 'source', 'externalId'],
  { unique: true, where: '"deleted_at" IS NULL' },
)
@Check('CHK_entity_source_link_type', `"entity_type" IN ('place','activity')`)
@Entity('entity_source_link')
export class EntitySourceLink extends BaseEntity {
  @Column({ name: 'entity_type', type: 'varchar', length: 12 })
  entityType: 'place' | 'activity';

  @Column({ name: 'entity_id', type: 'integer' })
  entityId: number;

  @Column({ type: 'varchar', length: 60 })
  source: string;

  @Column({ name: 'external_id', type: 'varchar', length: 255 })
  externalId: string;

  @Column({ name: 'license_class', type: 'varchar', length: 20 })
  licenseClass: LicenseClass;

  /** 0..1 confidence of the match; below the review threshold it is flagged. */
  @Column({
    name: 'match_confidence',
    type: 'numeric',
    precision: 3,
    scale: 2,
    nullable: true,
  })
  matchConfidence: string | null;

  @Column({ name: 'last_seen_at', type: 'timestamptz', default: () => 'now()' })
  lastSeenAt: Date;
}
