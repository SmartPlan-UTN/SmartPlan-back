export interface PublicRatingDto {
  images?: import('../../media/dto/media-response.dto').MediaImageDto[];
  id: number;
  score: number;
  comment: string | null;
  authorAlias: string;
  createdAt: Date;
  updatedAt: Date;
  /** Whether the viewer wrote it: their own rating cannot be reported. */
  isOwn: boolean;
}

export interface OwnRatingDto extends PublicRatingDto {
  activityId: number;
  planId: number;
  /**
   * An administrator removed it after a report: only its author still sees
   * it. A rating under review shows no trace of it (SmartPlan-front#156).
   */
  removed: boolean;
}

export interface RatingSummaryDto {
  averageRating: number;
  ratingCount: number;
}
