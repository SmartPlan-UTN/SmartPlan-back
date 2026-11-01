import { isPubliclyVisible } from '../common/moderation/content-status';
import type { Rating } from './entities/rating.entity';

/**
 * The scores that count towards a public average: a rating under review or
 * removed counts for no one (SmartPlan-front#156). The in-memory twin of
 * `publicContentSql('"rating"."status"')`.
 */
export function publicRatingScores(
  ratings: Pick<Rating, 'status' | 'score'>[],
): number[] {
  return ratings
    .filter((rating) => isPubliclyVisible(rating.status))
    .map((rating) => rating.score);
}
