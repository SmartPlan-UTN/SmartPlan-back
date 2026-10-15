import type { PlanPriceSummaryDto, PriceDto } from '../../common/pricing/price';
import {
  FeedbackStatusKey,
  PlanStatusKey,
  UserStatusKey,
} from './admin-list-query.dto';
import { PlanKind, PlanVisibility } from '../../plans/entities/plan.entity';
import { ExploreHiddenCause } from '../../plans/plan-selectability';
import { CostBasis, TimeOfDay } from '../../activities/activity-constraints';

export interface AdminUserDto {
  id: number;
  name: string;
  lastName: string;
  email: string;
  role: { key: string; name: string };
  status: { key: UserStatusKey; name: string };
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminActivityDto {
  costBasis: CostBasis;
  availableTimesOfDay: TimeOfDay[];
  minPeople: number | null;
  maxPeople: number | null;
  id: number;
  name: string;
  description: string;
  estimatedCost: number | null;
  price: PriceDto;
  estimatedDuration: number;
  type: string | null;
  /**
   * Where the activity may appear. Administrators see WHY something is not
   * shown or recommended instead of finding out from the public site.
   */
  eligibility: {
    status: 'draft' | 'in_review' | 'published' | 'archived';
    discoverable: boolean;
    planEligible: boolean;
    autoRecommendEligible: boolean;
    reasons: string[];
  };
  categories: Array<{ id: number; name: string }>;
  places: Array<{ id: number; name: string; address: string }>;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminPlanDto {
  id: number;
  title: string;
  description: string | null;
  estimatedTotalCost: number | null;
  estimatedTotalCostMax: number | null;
  unpricedCount: number;
  priceCompleteness: PlanPriceSummaryDto['priceCompleteness'];
  estimatedTotalDuration: number;
  peopleCount: number;
  activityCount: number;
  /** Where the plan comes from; only `authored` plans can reach Explorar. */
  kind: PlanKind;
  visibility: PlanVisibility;
  /** Whether Explorar > Planes lists it right now (#160). */
  listedInExplore: boolean;
  /** Why Explorar leaves it out; `null` when `listedInExplore`. */
  exploreHiddenCause: ExploreHiddenCause | null;
  owner: { id: number; name: string; lastName: string; email: string };
  status: { key: PlanStatusKey; name: string };
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminPermissionDto {
  id: number;
  key: string;
  name: string;
  description: string | null;
  roles: Array<{ id: number; key: string; name: string }>;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminRoleDto {
  id: number;
  key: string;
  name: string;
  description: string | null;
}

export interface AdminFeedbackDto {
  id: number;
  rating: number;
  tags: string[];
  comment: string | null;
  actualCost: number | null;
  actualDuration: number | null;
  status: { key: FeedbackStatusKey; name: string };
  plan: { id: number; title: string };
  author: { id: number; name: string; lastName: string; email: string };
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminRolePermissionsDto {
  id: number;
  key: string;
  name: string;
  description: string | null;
  permissions: Array<{ id: number; key: string; name: string }>;
}

export interface AdministrationMetricsDto {
  range: { key: string; from: Date; to: Date };
  kpis: {
    totalUsers: number;
    activePlans: number;
    catalogActivities: number;
    /** Content with open reports waiting for a decision (#156). */
    openReports: number;
  };
  acceptanceRate: number;
  averageRating: number;
  retentionRate: number;
  distributions: {
    moods: Array<{
      key: string;
      name: string;
      count: number;
      percentage: number;
    }>;
    groupSizes: Array<{
      key: string;
      name: string;
      count: number;
      percentage: number;
    }>;
  };
  popularActivities: Array<{ id: number; name: string; planCount: number }>;
  recentActivity: Array<{
    id: number;
    action: string;
    affectedEntity: string;
    affectedEntityId: number;
    label: string;
    createdAt: Date;
  }>;
}
