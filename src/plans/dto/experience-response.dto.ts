import type { PriceCompleteness } from '../../common/pricing/price';
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
  likeCount: number;
  /** Distinct completed outings explicitly attached to this public review. */
  visitCount: number;
  likedByViewer: boolean;
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
  author: { alias: string; username?: string; avatarUrl: string | null };
  inspiredBy?: {
    id: number;
    title: string;
    creatorUsername: string | null;
  } | null;
  /** The published plan this was lived from; `null` when it is not public. */
  plan?: { id: number; title: string; creatorUsername: string | null } | null;
  photos: MediaImageDto[];
}

/** A published idea as the community lists it. */
export interface CommunityPlanCardDto {
  id: number;
  title: string;
  description: string | null;
  estimatedTotalCost: number | null;
  estimatedTotalCostMax: number | null;
  priceCompleteness: PriceCompleteness;
  estimatedTotalDuration: number;
  imageUrl: string | null;
  /** `google_maps` photos must be credited to Google Maps. */
  imageSource: 'uploaded' | 'google_maps' | null;
  peopleCount: number;
  /** Names of the stops, in order. */
  stops: string[];
  /** Shared experiences lived from it. */
  experienceCount: number;
  sharedAverageRating: number | null;
  /** Published plans other people adapted from it. */
  adaptationCount: number;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
  inspiredBy: {
    id: number;
    title: string;
    creatorUsername: string | null;
  } | null;
}

export type CommunityFeedItemDto =
  | { kind: 'plan'; plan: CommunityPlanCardDto }
  | { kind: 'experience'; experience: ExperienceDto };

export interface CommunityCreatorSummaryDto {
  username: string;
  bio: string | null;
  avatarUrl: string | null;
  planCount: number;
  experienceCount: number;
  likeCount: number;
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
