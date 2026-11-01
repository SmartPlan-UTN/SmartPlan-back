import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { ExternalSync } from '../../external-integration/entities/external-sync.entity';
import { Place } from '../../places/entities/place.entity';
import { User } from '../../users/entities/user.entity';
import type { ActivityRecord, PlaceRecord } from '../catalog-package';

export const CANDIDATE_ENTITY_TYPES = ['activity', 'place'] as const;
export type CandidateEntityType = (typeof CANDIDATE_ENTITY_TYPES)[number];

export const CANDIDATE_STATUSES = ['pending', 'approved', 'discarded'] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const CANDIDATE_ORIGINS = [
  'initial_load',
  'monthly_refresh',
  'manual',
] as const;
export type CandidateOrigin = (typeof CANDIDATE_ORIGINS)[number];

export interface CandidateSourceRef {
  url: string;
  /** ISO date the source was read. */
  checkedAt: string | null;
}

/**
 * A proposed activity or place waiting for a person to review it (RF44,
 * CU50). Nothing an agent or Gemini proposes is published directly: it lands
 * here, and approving it runs the regular catalog import (validation,
 * eligibility and change log). The fingerprint is unique across every
 * status, so a discarded proposal never comes back.
 */
@Index('IDX_catalog_candidate_queue', ['status', 'entityType', 'createdAt'])
@Index('IDX_catalog_candidate_fingerprint', ['fingerprint'], { unique: true })
@Check(
  'CHK_catalog_candidate_entity_type',
  `"entity_type" IN ('activity','place')`,
)
@Check(
  'CHK_catalog_candidate_status',
  `"status" IN ('pending','approved','discarded')`,
)
@Check(
  'CHK_catalog_candidate_origin',
  `"origin" IN ('initial_load','monthly_refresh','manual')`,
)
@Check(
  'CHK_catalog_candidate_discard_reason',
  `"status" <> 'discarded' OR "discard_reason" IS NOT NULL`,
)
@Entity('catalog_candidate')
export class CatalogCandidate extends BaseEntity {
  @Column({ name: 'entity_type', type: 'varchar', length: 12 })
  entityType: CandidateEntityType;

  @Column({ type: 'varchar', length: 12, default: 'pending' })
  status: CandidateStatus;

  @Column({ type: 'varchar', length: 20 })
  origin: CandidateOrigin;

  /** The place an activity candidate belongs to. */
  @Index('IDX_catalog_candidate_place')
  @Column({ name: 'id_place', type: 'integer', nullable: true })
  idPlace: number | null;

  @ManyToOne(() => Place, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'id_place' })
  place: Place | null;

  /**
   * The record as it would be imported, in the catalog package v2 shape and
   * validated with its allow-lists (so no restricted Google content).
   */
  @Column({ type: 'jsonb' })
  payload: ActivityRecord | PlaceRecord;

  /** What the agent or Gemini proposed, to measure how much review changed. */
  @Column({ name: 'original_payload', type: 'jsonb' })
  originalPayload: ActivityRecord | PlaceRecord;

  @Column({
    name: 'source_refs',
    type: 'jsonb',
    default: () => "'[]'::jsonb",
  })
  sourceRefs: CandidateSourceRef[];

  /** Warnings for the reviewer: `source_unverified`, `possible_duplicate_of:<slug>`. */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  notes: string[];

  /** sha256(entity type | place slug | normalised name). */
  @Column({ type: 'varchar', length: 64 })
  fingerprint: string;

  /** The monthly run that proposed it (CU51). */
  @Index('IDX_catalog_candidate_external_sync')
  @Column({ name: 'id_external_sync', type: 'integer', nullable: true })
  idExternalSync: number | null;

  @ManyToOne(() => ExternalSync, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'id_external_sync' })
  externalSync: ExternalSync | null;

  /** The model that proposed it, when one did. */
  @Column({ type: 'varchar', length: 60, nullable: true })
  model: string | null;

  @Column({
    name: 'discard_reason',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  discardReason: string | null;

  @Index('IDX_catalog_candidate_reviewer')
  @Column({ name: 'reviewed_by', type: 'integer', nullable: true })
  reviewedBy: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewed_by' })
  reviewer: User | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  /** The activity or place created when it was approved. */
  @Column({ name: 'applied_entity_id', type: 'integer', nullable: true })
  appliedEntityId: number | null;
}
