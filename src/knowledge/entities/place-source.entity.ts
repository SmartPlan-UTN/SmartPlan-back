import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { Place } from '../../places/entities/place.entity';

export const PLACE_SOURCE_KINDS = [
  'OFFICIAL_SITE',
  'MENU_PAGE',
  'MENU_PDF',
  'BOOKING_PROVIDER',
  'LINK_HUB',
] as const;
export type PlaceSourceKind = (typeof PLACE_SOURCE_KINDS)[number];

/** Where SmartPlan first heard of the URL. Only a hint until verified. */
export const SOURCE_DISCOVERY = [
  'REGISTRY',
  'WIKIDATA',
  'OSM_HINT',
  'GOOGLE_WEBSITE_URI',
  'CURATOR',
  'LINK_FROM_OFFICIAL',
  'CATALOG_REF',
  /** A domain derived from the venue's name, kept only if the page proves it. */
  'DOMAIN_GUESS',
] as const;
export type SourceDiscovery = (typeof SOURCE_DISCOVERY)[number];

export const IDENTITY_STATUSES = [
  'CANDIDATE',
  'VERIFIED',
  'NOT_BRANCH',
  'UNCONFIRMED',
  'REJECTED',
] as const;
export type SourceIdentityStatus = (typeof IDENTITY_STATUSES)[number];

/**
 * A public page that may speak for a venue: its own site, its menu, its
 * booking page. Facts read from it become canonical only once its identity
 * is VERIFIED; the refresh job re-reads it when `next_check_at` passes.
 */
@Entity('place_source')
@Index('UQ_place_source_url', ['idPlace', 'url'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Index('IDX_place_source_next_check', ['nextCheckAt'])
@Check(
  'CHK_place_source_kind',
  `"kind" IN ('OFFICIAL_SITE','MENU_PAGE','MENU_PDF','BOOKING_PROVIDER','LINK_HUB')`,
)
@Check(
  'CHK_place_source_identity',
  `"identity_status" IN ('CANDIDATE','VERIFIED','NOT_BRANCH','UNCONFIRMED','REJECTED')`,
)
export class PlaceSource extends BaseEntity {
  @Column({ name: 'id_place', type: 'integer' })
  idPlace: number;

  @ManyToOne(() => Place, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_place' })
  place: Place;

  @Column({ type: 'varchar', length: 20 })
  kind: PlaceSourceKind;

  @Column({ type: 'varchar', length: 500 })
  url: string;

  @Column({ name: 'discovered_via', type: 'varchar', length: 30 })
  discoveredVia: SourceDiscovery;

  @Column({
    name: 'identity_status',
    type: 'varchar',
    length: 20,
    default: 'CANDIDATE',
  })
  identityStatus: SourceIdentityStatus;

  /** The corroborating signals (name_on_page, address_on_page…). */
  @Column({ name: 'identity_signals', type: 'jsonb', default: () => "'[]'" })
  identitySignals: string[];

  @Column({ name: 'last_fetched_at', type: 'timestamptz', nullable: true })
  lastFetchedAt: Date | null;

  /** ok, robots_disallowed, blocked, http_error, no_facts… */
  @Column({ name: 'last_status', type: 'varchar', length: 40, nullable: true })
  lastStatus: string | null;

  @Column({ name: 'content_hash', type: 'varchar', length: 64, nullable: true })
  contentHash: string | null;

  @Column({ name: 'next_check_at', type: 'timestamptz', nullable: true })
  nextCheckAt: Date | null;

  @Column({ name: 'failure_count', type: 'integer', default: 0 })
  failureCount: number;
}
