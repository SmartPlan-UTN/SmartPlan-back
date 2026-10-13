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
  /**
   * `null` when there is none, or when it is hidden after a report from
   * anyone but its author (SmartPlan-front#156).
   */
  comment: string | null;
  /** Whether the viewer wrote it: their own content cannot be reported. */
  isOwn: boolean;
  /** When the outing was done. */
  completedAt: Date | null;
  author: { alias: string; avatarUrl: string | null };
  photos: MediaImageDto[];
}

/** A photo of the community gallery, reportable unless the viewer took it. */
export interface CommunityPhotoDto extends MediaImageDto {
  isOwn: boolean;
}

export interface ExperiencesSummaryDto {
  averageRating: number;
  experienceCount: number;
  photoCount: number;
  /** The most recent photos across every experience. */
  photos: CommunityPhotoDto[];
}

export interface ExperiencesPageDto extends PaginatedResponse<ExperienceDto> {
  summary: ExperiencesSummaryDto;
}
