import type { CommunityContentStatus } from '../../common/moderation/community-content-status';
import type { PaginatedResponse } from '../../common/pagination/paginated-response';
import type { MediaImageDto } from '../../media/dto/media-response.dto';
import type { FeedbackTag } from '../../recommendation/entities/feedback.entity';

/**
 * One person's shared experience of a published plan (#106), as the
 * community sees it: what they thought, when they went, and their photos.
 */
export interface ExperienceDto {
  id: number;
  rating: number;
  tags: FeedbackTag[];
  /** `null` when there is none or moderation took it down. */
  comment: string | null;
  /** When the outing was done. */
  completedAt: Date | null;
  author: { alias: string; avatarUrl: string | null };
  photos: MediaImageDto[];
}

export interface ExperiencesSummaryDto {
  averageRating: number;
  experienceCount: number;
  photoCount: number;
  /** The most recent photos across every experience. */
  photos: MediaImageDto[];
}

export interface ExperiencesPageDto extends PaginatedResponse<ExperienceDto> {
  summary: ExperiencesSummaryDto;
}

export interface AdminExperiencePhotoDto extends MediaImageDto {
  communityStatus: CommunityContentStatus;
  communityReason: string | null;
}

/** A shared experience in the administrator's moderation queue (#106). */
export interface AdminExperienceDto {
  id: number;
  rating: number;
  tags: FeedbackTag[];
  comment: string | null;
  commentStatus: CommunityContentStatus | null;
  commentModerationReason: string | null;
  shared: boolean;
  sharedAt: Date | null;
  completedAt: Date | null;
  outingId: number;
  plan: { id: number; title: string } | null;
  author: { id: number; name: string; lastName: string };
  photos: AdminExperiencePhotoDto[];
}
