import { Check, Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';

export const ODBL_LICENSE = 'ODbL-1.0';
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

export const ODBL_MATCH_STATUSES = [
  /** A new SmartPlan Place was created from this feature (identity ODbL). */
  'CREATED',
  /** Linked to an existing Place (same physical venue). */
  'LINKED',
  /** Same physical venue as another feature (e.g. a duplicated node). */
  'DUPLICATE',
  /** Not plannable (no supported kind, outside Mendoza, no department). */
  'SKIPPED',
] as const;
export type OdblMatchStatus = (typeof ODBL_MATCH_STATUSES)[number];

/**
 * One OpenStreetMap element exactly as imported, in its own ODbL layer:
 * provenance (element, version, edit time, snapshot), licence and
 * attribution travel with it, so the OSM-derived identity data stays
 * separable from SmartPlan-owned facts (hours, prices, menus, traits) that
 * are attached to the Place as independent properties.
 */
@Entity('odbl_feature')
@Index('UQ_odbl_feature_element', ['osmType', 'osmId'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Index('IDX_odbl_feature_place', ['idPlace'])
@Check('CHK_odbl_feature_type', `"osm_type" IN ('node','way','relation')`)
@Check(
  'CHK_odbl_feature_status',
  `"match_status" IN ('CREATED','LINKED','DUPLICATE','SKIPPED')`,
)
export class OdblFeature extends BaseEntity {
  @Column({ name: 'osm_type', type: 'varchar', length: 10 })
  osmType: 'node' | 'way' | 'relation';

  @Column({ name: 'osm_id', type: 'bigint' })
  osmId: string;

  @Column({ name: 'osm_version', type: 'integer', nullable: true })
  osmVersion: number | null;

  /** When the element was last edited in OSM (freshness of the identity). */
  @Column({ name: 'osm_timestamp', type: 'timestamptz', nullable: true })
  osmTimestamp: Date | null;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column('numeric', { precision: 9, scale: 6 })
  latitude: string;

  @Column('numeric', { precision: 9, scale: 6 })
  longitude: string;

  /** The element's tags as published (ODbL), never mixed into Place columns. */
  @Column({ type: 'jsonb' })
  tags: Record<string, string>;

  @Column({ type: 'varchar', length: 20, default: ODBL_LICENSE })
  license: string;

  @Column({ type: 'varchar', length: 120, default: OSM_ATTRIBUTION })
  attribution: string;

  /** The OSM data snapshot the import read (`osm_base`). */
  @Column({ name: 'snapshot_at', type: 'timestamptz' })
  snapshotAt: Date;

  @Column({ name: 'id_place', type: 'integer', nullable: true })
  idPlace: number | null;

  @Column({ name: 'match_status', type: 'varchar', length: 12 })
  matchStatus: OdblMatchStatus;

  @Column({ name: 'match_note', type: 'varchar', length: 200, nullable: true })
  matchNote: string | null;
}
