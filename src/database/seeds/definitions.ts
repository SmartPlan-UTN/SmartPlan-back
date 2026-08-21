export const MAX_LENGTH = {
  key: 40,
  name: 80,
  description: 200,
} as const;

export const USER_ROLE = 'user';

export const ADMIN_ROLE = 'admin';

export type RoleKey = typeof USER_ROLE | typeof ADMIN_ROLE;

export interface CatalogValue {
  key: string;
  name: string;
  description: string;
}

export interface PermissionDefinition extends CatalogValue {
  roles: readonly RoleKey[];
}

const BOTH_ROLES: readonly RoleKey[] = [USER_ROLE, ADMIN_ROLE];
const ADMIN_ONLY: readonly RoleKey[] = [ADMIN_ROLE];

export const ROLES: readonly CatalogValue[] = [
  {
    key: USER_ROLE,
    name: 'User',
    description:
      'Registered person who generates, saves, and rates their own plans.',
  },
  {
    key: ADMIN_ROLE,
    name: 'Administrator',
    description: 'Manages the catalog, users, and system moderation.',
  },
];

export const PERMISSIONS: readonly PermissionDefinition[] = [
  {
    key: 'profile.view',
    name: 'View own profile',
    description: 'View the account data.',
    roles: BOTH_ROLES,
  },
  {
    key: 'profile.update',
    name: 'Edit own profile',
    description: 'Modify the account data (CU5).',
    roles: BOTH_ROLES,
  },
  {
    key: 'profile.change-password',
    name: 'Change own password',
    description: 'Replace the account password (CU6).',
    roles: BOTH_ROLES,
  },
  {
    key: 'profile.delete',
    name: 'Delete own account',
    description: 'Delete the account (CU7).',
    roles: BOTH_ROLES,
  },
  {
    key: 'preference.update',
    name: 'Edit own preferences',
    description:
      'Choose the categories and parameters that drive recommendations (CU8, CU18).',
    roles: BOTH_ROLES,
  },

  {
    key: 'activity.list',
    name: 'List activities',
    description:
      'Search, filter and sort the catalog of activities (CU9, CU10, CU11, CU16).',
    roles: BOTH_ROLES,
  },
  {
    key: 'activity.view',
    name: 'View an activity',
    description: 'View the details of a catalog activity (CU14).',
    roles: BOTH_ROLES,
  },
  {
    key: 'activity.create',
    name: 'Create activities',
    description: 'Create an activity in the catalog (CU53).',
    roles: ADMIN_ONLY,
  },
  {
    key: 'activity.update',
    name: 'Edit activities',
    description: 'Modify a catalog activity (CU53).',
    roles: ADMIN_ONLY,
  },
  {
    key: 'activity.delete',
    name: 'Delete activities',
    description: 'Delete a catalog activity (CU53).',
    roles: ADMIN_ONLY,
  },

  {
    key: 'category.list',
    name: 'List categories',
    description:
      'View available categories to filter activities and choose preferences (CU10).',
    roles: BOTH_ROLES,
  },
  {
    key: 'category.create',
    name: 'Create categories',
    description: 'Create a catalog category (CU54).',
    roles: ADMIN_ONLY,
  },
  {
    key: 'category.update',
    name: 'Edit categories',
    description: 'Modify or deactivate a catalog category (CU54).',
    roles: ADMIN_ONLY,
  },
  {
    key: 'category.delete',
    name: 'Delete categories',
    description: 'Delete a catalog category (CU54).',
    roles: ADMIN_ONLY,
  },

  {
    key: 'plan.list',
    name: 'List plans',
    description: 'Search own and recommended plans (CU12, CU20).',
    roles: BOTH_ROLES,
  },
  {
    key: 'plan.view',
    name: 'View plan',
    description: 'View plan details, activities, and cost (CU13, CU29, CU30).',
    roles: BOTH_ROLES,
  },
  {
    key: 'plan.generate',
    name: 'Generate automatic plans',
    description:
      'Ask the recommendation engine to generate a plan from a request (CU17, CU19, CU31).',
    roles: BOTH_ROLES,
  },
  {
    key: 'plan.select',
    name: 'Select plan',
    description: 'Choose one of the plans returned for a request (CU22).',
    roles: BOTH_ROLES,
  },
  {
    key: 'plan.create',
    name: 'Create own plans',
    description:
      'Build a plan manually without the recommendation engine (CU24).',
    roles: BOTH_ROLES,
  },
  {
    key: 'plan.update',
    name: 'Edit own plans',
    description:
      'Modify an own plan and add or remove activities (CU25, CU27, CU28).',
    roles: BOTH_ROLES,
  },
  {
    key: 'plan.delete',
    name: 'Delete own plans',
    description: 'Delete an own plan (CU26).',
    roles: BOTH_ROLES,
  },
  {
    key: 'plan.manage',
    name: 'Manage plans of any user',
    description: 'Edit or delete any user plan from administration (CU60).',
    roles: ADMIN_ONLY,
  },

  {
    key: 'feedback.create',
    name: 'Submit feedback',
    description:
      'Submit post-experience feedback that improves recommendations (CU23).',
    roles: BOTH_ROLES,
  },
  {
    key: 'feedback.review',
    name: 'Review feedback',
    description:
      'Review user suggestions and decide whether to incorporate them (CU59).',
    roles: ADMIN_ONLY,
  },

  {
    key: 'collection.list',
    name: 'List own collections',
    description: 'View the collections created by the user (CU38).',
    roles: BOTH_ROLES,
  },
  {
    key: 'collection.view',
    name: 'View collection',
    description: 'View the details and activities of an own collection (CU37).',
    roles: BOTH_ROLES,
  },
  {
    key: 'collection.create',
    name: 'Create collections',
    description: 'Build a collection of activities (CU32).',
    roles: BOTH_ROLES,
  },
  {
    key: 'collection.update',
    name: 'Edit own collections',
    description:
      'Rename an own collection and add or remove activities (CU33, CU35, CU36).',
    roles: BOTH_ROLES,
  },
  {
    key: 'collection.delete',
    name: 'Delete own collections',
    description: 'Delete an own collection (CU34).',
    roles: BOTH_ROLES,
  },

  {
    key: 'favorite.list',
    name: 'List own favorites',
    description: 'View the activities and the plans saved (CU39, CU40).',
    roles: BOTH_ROLES,
  },
  {
    key: 'favorite.save',
    name: 'Save in favorites',
    description: 'Save an activity or plan to favorites (CU15, CU43).',
    roles: BOTH_ROLES,
  },
  {
    key: 'favorite.remove',
    name: 'Remove from favorites',
    description: 'Remove an activity or plan from favorites (CU41, CU42).',
    roles: BOTH_ROLES,
  },

  {
    key: 'rating.list',
    name: 'List ratings',
    description: 'View the ratings published (CU45).',
    roles: BOTH_ROLES,
  },
  {
    key: 'rating.create',
    name: 'Create ratings',
    description: 'Rate and comment on a completed experience (CU44).',
    roles: BOTH_ROLES,
  },
  {
    key: 'rating.update',
    name: 'Edit own ratings',
    description: 'Modify an own rating (CU46).',
    roles: BOTH_ROLES,
  },
  {
    key: 'rating.delete',
    name: 'Delete own ratings',
    description: 'Delete an own rating (CU47).',
    roles: BOTH_ROLES,
  },
  {
    key: 'rating.moderate',
    name: 'Moderate ratings',
    description: 'Approve or reject ratings of any user (CU55).',
    roles: ADMIN_ONLY,
  },

  {
    key: 'user.list',
    name: 'List users',
    description: 'View the list of users of the system (CU57).',
    roles: ADMIN_ONLY,
  },
  {
    key: 'user.view',
    name: 'View a user',
    description: 'View the details of a user of the system (CU57).',
    roles: ADMIN_ONLY,
  },
  {
    key: 'user.update',
    name: 'Edit users',
    description: 'Modify the data and the role of a user (CU57).',
    roles: ADMIN_ONLY,
  },
  {
    key: 'user.change-status',
    name: 'Change the status of a user',
    description: 'Suspend, ban, or reactivate an account (CU57).',
    roles: ADMIN_ONLY,
  },
  {
    key: 'user.delete',
    name: 'Delete users',
    description: 'Delete the account of a user (CU57).',
    roles: ADMIN_ONLY,
  },
  {
    key: 'content.delete',
    name: 'Delete content',
    description: 'Delete user content that violates the rules (CU56).',
    roles: ADMIN_ONLY,
  },
  {
    key: 'metric.view',
    name: 'View system metrics',
    description: 'View the system dashboard and indicators (CU58, REP-01).',
    roles: ADMIN_ONLY,
  },
  {
    key: 'role.list',
    name: 'List roles',
    description: 'View the roles defined in the system (CU62).',
    roles: ADMIN_ONLY,
  },
  {
    key: 'role.create',
    name: 'Create roles',
    description: 'Create a new role (CU62).',
    roles: ADMIN_ONLY,
  },
  {
    key: 'role.update',
    name: 'Edit roles',
    description: 'Modify the name or the description of a role (CU62).',
    roles: ADMIN_ONLY,
  },
  {
    key: 'role.delete',
    name: 'Delete roles',
    description: 'Delete a role (CU62).',
    roles: ADMIN_ONLY,
  },
  {
    key: 'permission.list',
    name: 'List permissions',
    description: 'View the permissions available in the system (CU61).',
    roles: ADMIN_ONLY,
  },
  {
    key: 'permission.assign',
    name: 'Assign permissions to a role',
    description: 'Grant or revoke permissions for a role (CU61).',
    roles: ADMIN_ONLY,
  },
];

export const USER_STATUSES: readonly CatalogValue[] = [
  {
    key: 'active',
    name: 'Active',
    description: 'The account can sign in and use the system.',
  },
  {
    key: 'suspended',
    name: 'Suspended',
    description:
      'Access is temporarily blocked by an administrative decision (CU57).',
  },
  {
    key: 'banned',
    name: 'Banned',
    description:
      'Access is permanently blocked for violating the terms of use.',
  },
];

export const PLAN_STATUSES: readonly CatalogValue[] = [
  {
    key: 'generated',
    name: 'Generated',
    description:
      'Generated by the recommendation engine and not yet selected by the user (CU17).',
  },
  {
    key: 'selected',
    name: 'Selected',
    description:
      'Selected by the user from the plans returned for a request (CU22).',
  },
  {
    key: 'confirmed',
    name: 'Confirmed',
    description: 'The user confirmed that they intend to complete the plan.',
  },
  {
    key: 'completed',
    name: 'Completed',
    description:
      'The plan occurred and can now receive experience feedback (CU23).',
  },
  {
    key: 'cancelled',
    name: 'Cancelled',
    description: 'The plan was cancelled before it occurred (CU26).',
  },
];

export const CATEGORY_STATUSES: readonly CatalogValue[] = [
  {
    key: 'active',
    name: 'Active',
    description:
      'Available in search filters and considered in recommendations (CU10).',
  },
  {
    key: 'inactive',
    name: 'Inactive',
    description:
      'No longer offered, but remains assigned to existing activities.',
  },
];

export const FEEDBACK_STATUSES: readonly CatalogValue[] = [
  {
    key: 'pending',
    name: 'Pending',
    description:
      'Submitted by the user and not yet added to the recommendation model.',
  },
  {
    key: 'processed',
    name: 'Processed',
    description: 'It was already used to adjust user recommendations (CU21).',
  },
  {
    key: 'discarded',
    name: 'Discarded',
    description: 'It was reviewed and rejected (CU59).',
  },
];

export const INITIAL_CATEGORY_STATUS = 'active';

export interface CategoryDefinition {
  name: string;
  description: string;
}

export const CATEGORIES: readonly CategoryDefinition[] = [
  {
    name: 'Gastronomy',
    description: 'Restaurants, wineries, cafes, and dining experiences.',
  },
  {
    name: 'Outdoors',
    description: 'Parks, mountains, trekking, and outdoor activities.',
  },
  {
    name: 'Culture',
    description: 'Museums, theater, heritage sites, and guided tours.',
  },
  {
    name: 'Entertainment',
    description: 'Cinema, games, theme parks, and shows.',
  },
  {
    name: 'Nightlife',
    description: 'Bars, clubs, and nightlife outings.',
  },
  {
    name: 'Sports',
    description: 'Sports activities to practice or watch.',
  },
  {
    name: 'Live music',
    description: 'Concerts, folk venues, and live music shows.',
  },
  {
    name: 'Wellness',
    description: 'Spa, hot springs, yoga, and relaxation activities.',
  },
  {
    name: 'Shopping',
    description: 'Fairs, markets, shopping trips, and crafts.',
  },
  {
    name: 'Short trips',
    description: 'Day trips to nearby destinations.',
  },
];
