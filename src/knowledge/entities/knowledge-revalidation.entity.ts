import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { Place } from '../../places/entities/place.entity';

export const REVALIDATION_REASONS = [
  'EXPIRED',
  'FETCH_FAILED',
  'CONTENT_CHANGED',
  'NEEDS_DURABLE_HOURS',
  'NEEDS_DURABLE_LOCATION',
  'USER_REPORT_CLOSED',
  'USER_REPORT_HOURS',
  'USER_REPORT_PRICE',
  'USER_REPORT_UNAVAILABLE',
  'SPEND_DIVERGENCE',
] as const;
export type RevalidationReason = (typeof REVALIDATION_REASONS)[number];

export const REVALIDATION_STATUSES = ['PENDING', 'DONE', 'UNRESOLVED'] as const;
export type RevalidationStatus = (typeof REVALIDATION_STATUSES)[number];

/**
 * "Look at this venue again": a user said it closed, real spending keeps
 * diverging from the menu estimate, a source failed or changed, or the
 * planner had to ask Google for hours we should know durably. The refresh
 * job works the queue by priority; nothing here overwrites a fact by itself.
 */
@Entity('knowledge_revalidation')
@Index('IDX_knowledge_revalidation_queue', ['status', 'priority', 'createdAt'])
@Index('UQ_knowledge_revalidation_open', ['idPlace', 'reason'], {
  unique: true,
  where: `"deleted_at" IS NULL AND "status" = 'PENDING'`,
})
@Check(
  'CHK_knowledge_revalidation_reason',
  `"reason" IN ('EXPIRED','FETCH_FAILED','CONTENT_CHANGED','NEEDS_DURABLE_HOURS','NEEDS_DURABLE_LOCATION','USER_REPORT_CLOSED','USER_REPORT_HOURS','USER_REPORT_PRICE','USER_REPORT_UNAVAILABLE','SPEND_DIVERGENCE')`,
)
@Check(
  'CHK_knowledge_revalidation_status',
  `"status" IN ('PENDING','DONE','UNRESOLVED')`,
)
export class KnowledgeRevalidation extends BaseEntity {
  @Column({ name: 'id_place', type: 'integer' })
  idPlace: number;

  @ManyToOne(() => Place, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_place' })
  place: Place;

  @Column({ type: 'varchar', length: 30 })
  reason: RevalidationReason;

  /** 1 = most urgent (a user report) … 5 = routine. */
  @Column({ type: 'smallint', default: 3 })
  priority: number;

  @Column({ type: 'varchar', length: 12, default: 'PENDING' })
  status: RevalidationStatus;

  /** How many signals asked for it (repeated reports raise urgency). */
  @Column({ name: 'signal_count', type: 'integer', default: 1 })
  signalCount: number;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  resolution: string | null;
}
