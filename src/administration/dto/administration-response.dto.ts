import {
  FeedbackStatusKey,
  PlanStatusKey,
  UserStatusKey,
} from './admin-list-query.dto';

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
  id: number;
  name: string;
  description: string;
  estimatedCost: number;
  estimatedDuration: number;
  type: string | null;
  categories: Array<{ id: number; name: string }>;
  places: Array<{ id: number; name: string; address: string }>;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminPlanDto {
  id: number;
  title: string;
  description: string | null;
  estimatedTotalCost: number;
  estimatedTotalDuration: number;
  peopleCount: number;
  activityCount: number;
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
    pendingRatings: number;
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
