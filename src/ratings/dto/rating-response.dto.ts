import { RatingModerationStatus } from '../entities/rating.entity';

export interface PublicRatingDto {
  id: number;
  score: number;
  comment: string | null;
  authorAlias: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OwnRatingDto extends PublicRatingDto {
  activityId: number;
  planId: number;
  moderationStatus: RatingModerationStatus;
  moderationReason: string | null;
}

export interface AdminRatingDto extends OwnRatingDto {
  author: { id: number; name: string; lastName: string };
}

export interface RatingSummaryDto {
  averageRating: number;
  ratingCount: number;
}
