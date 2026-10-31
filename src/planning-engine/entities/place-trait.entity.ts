import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { decimalTransformer } from '../../common/typeorm/decimal-transformer';
import { Place } from '../../places/entities/place.entity';
import type { PlaceTrait } from '../../catalog/place-actionability';

export const STORED_TRAIT_SOURCES = [
  'CURATED',
  'MENU_DERIVED',
  'LLM_FROM_EVIDENCE',
  'COMMUNITY',
] as const;
export type StoredTraitSource = (typeof STORED_TRAIT_SOURCES)[number];

/**
 * How a place feels for a context ("romantic", "lively", "good value"),
 * stated by one source. Quality is not here: a trait says what a place is
 * good FOR. Several sources may speak about the same trait; the planner
 * weighs them by source and confidence. Community traits carry how many
 * people supported them (`support_count`).
 */
@Index('UQ_place_trait_source', ['idPlace', 'trait', 'source'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Check('CHK_place_trait_score', '"score" BETWEEN -1 AND 1')
@Check('CHK_place_trait_confidence', '"confidence" BETWEEN 0 AND 1')
@Check(
  'CHK_place_trait_source',
  `"source" IN ('CURATED','MENU_DERIVED','LLM_FROM_EVIDENCE','COMMUNITY')`,
)
@Entity('place_trait')
export class PlaceTraitRecord extends BaseEntity {
  @Column({ name: 'id_place', type: 'integer' })
  idPlace: number;

  @ManyToOne(() => Place, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_place' })
  place: Place;

  @Column({ type: 'varchar', length: 40 })
  trait: PlaceTrait;

  @Column({
    type: 'numeric',
    precision: 3,
    scale: 2,
    transformer: decimalTransformer,
  })
  score: number;

  @Column({ type: 'varchar', length: 20 })
  source: StoredTraitSource;

  @Column({
    type: 'numeric',
    precision: 3,
    scale: 2,
    transformer: decimalTransformer,
  })
  confidence: number;

  @Column({ name: 'support_count', type: 'integer', default: 1 })
  supportCount: number;

  /** A short quote or URL supporting it. */
  @Column({ type: 'varchar', length: 300, nullable: true })
  evidence: string | null;
}
