import { PlanSummaryDto } from './plan-response.dto';

export interface PlanRecommendationDto {
  kind: 'own' | 'popular';
  plan: PlanSummaryDto;
  canSelect: boolean;
}
