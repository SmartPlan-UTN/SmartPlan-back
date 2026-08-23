export interface PlanCostSummaryDto {
  estimatedTotalCost: number;
  peopleCount: number;
  estimatedCostPerPerson: number;
  estimatedTotalDuration: number;
}

export interface OwnPlanSummaryDto extends PlanCostSummaryDto {
  id: number;
  title: string;
  description: string | null;
  activityCount: number;
  status: { key: string; name: string };
  createdAt: Date;
  updatedAt: Date;
}

export interface OwnPlanDetailItemDto {
  id: number;
  order: number;
  estimatedCost: number;
  estimatedDuration: number;
  activity: {
    id: number;
    name: string;
    description: string;
    estimatedCost: number;
    estimatedDuration: number;
    type: string | null;
  };
}

export interface OwnPlanDetailDto extends OwnPlanSummaryDto {
  details: OwnPlanDetailItemDto[];
}
