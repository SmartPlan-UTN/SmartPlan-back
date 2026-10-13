import type { ContentStatus } from '../../common/moderation/content-status';
import type {
  ReportableContentType,
  ReportReason,
} from '../entities/content-report.entity';

/** Reported content as an administrator reviews it, whatever its type. */
export interface ReportedContentDto {
  type: ReportableContentType;
  id: number;
  status: ContentStatus;
  /** The rating or experience comment; `null` for a photo. */
  text: string | null;
  /** The score of the rating or experience; `null` for a photo. */
  score: number | null;
  /** The photo itself; `null` otherwise. */
  imageUrl: string | null;
  createdAt: Date;
  author: { id: number; name: string; lastName: string };
  /** What it is about: the rated activity or the reviewed plan. */
  context: { kind: 'activity' | 'plan'; id: number; title: string };
}

/** One piece of content with open reports, in the administrator's queue. */
export interface ContentReportSummaryDto {
  contentType: ReportableContentType;
  contentId: number;
  reportCount: number;
  firstReportedAt: Date;
  lastReportedAt: Date;
  /** Kept by an administrator before, and reported again since. */
  previouslyKept: boolean;
  /** `null` when the content no longer exists. */
  content: ReportedContentDto | null;
}

export interface ContentReportItemDto {
  id: number;
  reason: ReportReason;
  detail: string | null;
  createdAt: Date;
  /** `null` for a report the system raised. */
  reporter: { id: number; name: string; lastName: string } | null;
}

export interface ContentReportDetailDto extends ContentReportSummaryDto {
  reports: ContentReportItemDto[];
}

export interface CreatedContentReportDto {
  id: number;
  createdAt: Date;
}
