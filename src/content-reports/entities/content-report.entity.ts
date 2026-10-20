import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { ContentDecision } from '../../common/moderation/content-status';
import { User } from '../../users/entities/user.entity';

/** The user content that can be reported (SmartPlan-front#156). */
export enum ReportableContentType {
  Rating = 'rating',
  ExperienceComment = 'experience_comment',
  ExperiencePhoto = 'experience_photo',
  /** A published plan; a report never hides it. */
  Plan = 'plan',
}

export enum ReportReason {
  Harassment = 'harassment',
  HateSpeech = 'hate_speech',
  SexualContent = 'sexual_content',
  Violence = 'violence',
  Spam = 'spam',
  Other = 'other',
}

export enum ReportStatus {
  Open = 'open',
  Resolved = 'resolved',
}

/**
 * One user's report about one piece of content. Every open report of the
 * same content is resolved together by a single administrator decision; a
 * user has at most one open report per content.
 */
@Index(
  'IDX_content_report_reporter_content_unique',
  ['idReporter', 'contentType', 'contentId'],
  {
    unique: true,
    where: `"id_reporter" IS NOT NULL AND "deleted_at" IS NULL AND "status" = 'open'`,
  },
)
@Index('IDX_content_report_content_status', [
  'contentType',
  'contentId',
  'status',
])
@Entity('content_report')
export class ContentReport extends BaseEntity {
  @Column({
    name: 'content_type',
    type: 'enum',
    enum: ReportableContentType,
    enumName: 'reportable_content_type',
  })
  contentType: ReportableContentType;

  @Column({ name: 'content_id', type: 'integer' })
  contentId: number;

  /** `null` for a report the system raised itself. */
  @Column({ name: 'id_reporter', type: 'integer', nullable: true })
  idReporter: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_reporter' })
  reporter: User | null;

  @Column({ type: 'enum', enum: ReportReason, enumName: 'report_reason' })
  reason: ReportReason;

  @Column({ type: 'varchar', length: 500, nullable: true })
  detail: string | null;

  @Column({
    type: 'enum',
    enum: ReportStatus,
    enumName: 'report_status',
    default: ReportStatus.Open,
  })
  status: ReportStatus;

  @Index('IDX_content_report_id_resolver')
  @Column({ name: 'id_resolver', type: 'integer', nullable: true })
  idResolver: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'id_resolver' })
  resolver: User | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({
    type: 'enum',
    enum: ContentDecision,
    enumName: 'content_decision',
    nullable: true,
  })
  resolution: ContentDecision | null;

  /** Why the content was removed; the author receives it. */
  @Column({
    name: 'resolution_reason',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  resolutionReason: string | null;
}
