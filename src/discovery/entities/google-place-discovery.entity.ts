import { Check, Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';

export const DISCOVERY_RESOLUTIONS = [
  'UNRESOLVED',
  /** The ID is the Google identity of a SmartPlan Place. */
  'LINKED',
  /** Seen, but SmartPlan has no durable (storable) identity for it yet. */
  'NO_DURABLE_IDENTITY',
  /** Two Places claim it: a curator must decide. */
  'AMBIGUOUS',
] as const;
export type DiscoveryResolution = (typeof DISCOVERY_RESOLUTIONS)[number];

/**
 * The broad discovery index: every Google Place ID that SmartPlan's ID-only
 * searches have returned (Text Search Essentials IDs Only, no provider
 * content). Place IDs are the one Places value that may be stored; what is
 * stored next to it is SmartPlan's own metadata (which of OUR discovery
 * cells found it, how often, when), never Google's ranking or content.
 */
@Entity('google_place_discovery')
@Index('UQ_google_place_discovery_id', ['googlePlaceId'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Index('IDX_google_place_discovery_place', ['idPlace'])
@Check(
  'CHK_google_place_discovery_resolution',
  `"resolution" IN ('UNRESOLVED','LINKED','NO_DURABLE_IDENTITY','AMBIGUOUS')`,
)
export class GooglePlaceDiscovery extends BaseEntity {
  @Column({ name: 'google_place_id', type: 'varchar', length: 255 })
  googlePlaceId: string;

  @Column({ name: 'first_seen_at', type: 'timestamptz' })
  firstSeenAt: Date;

  @Column({ name: 'last_seen_at', type: 'timestamptz' })
  lastSeenAt: Date;

  /** How many of SmartPlan's discovery cells returned it. */
  @Column({ type: 'integer', default: 0 })
  hits: number;

  /** SmartPlan discovery cells ("bar@godoy-cruz", "intent:con_onda@ciudad"). */
  @Column({ name: 'cells', type: 'text', array: true, default: () => "'{}'" })
  cells: string[];

  @Column({ name: 'id_place', type: 'integer', nullable: true })
  idPlace: number | null;

  @Column({ type: 'varchar', length: 24, default: 'UNRESOLVED' })
  resolution: DiscoveryResolution;

  @Column({
    name: 'resolution_method',
    type: 'varchar',
    length: 60,
    nullable: true,
  })
  resolutionMethod: string | null;

  @Column('numeric', { precision: 3, scale: 2, nullable: true })
  confidence: string | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;
}
