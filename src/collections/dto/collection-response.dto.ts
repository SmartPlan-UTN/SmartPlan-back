export interface CollectionSummaryDto {
  id: number;
  nameCollection: string;
  savedAt: Date;
  activityCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CollectionActivityDto {
  id: number;
  idCollection: number;
  idActivity: number;
  order: number | null;
  activity: {
    id: number;
    name: string;
    description: string;
    estimatedCost: number;
    estimatedDuration: number;
    type: string | null;
  };
}

export interface CollectionDetailDto extends CollectionSummaryDto {
  activities: CollectionActivityDto[];
}
