import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { Place } from '../../places/entities/place.entity';
import type { MenuItemFact } from '../menu/menu';

/** Append-only, curator-approved factual prices from a permitted official menu. */
@Entity('place_menu_observation')
@Index('IDX_place_menu_observation_place', ['idPlace', 'observedAt'])
@Index(
  'UQ_place_menu_observation_source',
  ['idPlace', 'contentHash', 'observedAt'],
  { unique: true, where: '"deleted_at" IS NULL' },
)
@Check(
  'CHK_place_menu_observation_dates',
  '"expires_at" > "observed_at" AND ("source_updated_at" IS NULL OR "source_updated_at" <= "observed_at")',
)
@Check(
  'CHK_place_menu_observation_items',
  'jsonb_typeof("items") = \'array\' AND jsonb_array_length("items") > 0',
)
export class PlaceMenuObservation extends BaseEntity {
  @Column({ name: 'id_place', type: 'integer' }) idPlace: number;
  @ManyToOne(() => Place, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'id_place' })
  place: Place;
  @Column({ name: 'source_url', type: 'varchar', length: 500 })
  sourceUrl: string;
  @Column({ name: 'observed_at', type: 'timestamptz' }) observedAt: Date;
  @Column({ name: 'source_updated_at', type: 'timestamptz', nullable: true })
  sourceUpdatedAt: Date | null;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date;
  @Column({ name: 'content_hash', type: 'varchar', length: 64 })
  contentHash: string;
  @Column({ type: 'jsonb' }) items: MenuItemFact[];
}
