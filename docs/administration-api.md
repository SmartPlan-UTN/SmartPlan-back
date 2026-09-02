# Administration API contract

Contract for frontend screens PAN 19–22 and REP-01 (CU53, CU55, CU57, CU58,
CU59, CU60, and CU61). All routes use the global `/api` prefix, require a bearer access
token, the `admin` role, and the permission shown below. User and session
hashes are never returned.

## Shared listing contract

All administration listings accept `page` (default `1`), `limit` (default
`20`, maximum `100`), `direction` (`asc` or `desc`), and an endpoint-specific
`sortBy`. They return:

```json
{
  "data": [],
  "pagination": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 }
}
```

Unknown query or body properties are rejected with `400`.

## Users — PAN 19 / CU57

| Method  | Route                         | Permission           | Input                                                                           |
| ------- | ----------------------------- | -------------------- | ------------------------------------------------------------------------------- |
| `GET`   | `/api/admin/users`            | `user.list`          | `search?`, `status?`, pagination; `sortBy=createdAt\|name\|email\|role\|status` |
| `PATCH` | `/api/admin/users/:id`        | `user.update`        | Any of `name`, `lastName`, `email`, `role`, or `status`                         |
| `PATCH` | `/api/admin/users/:id/status` | `user.change-status` | `{ "status": "active" \| "suspended" \| "banned" }`                             |

User rows contain `id`, `name`, `lastName`, `email`, `role`, `status`,
`createdAt`, and `updatedAt`. Suspending or banning an account immediately
revokes all its active sessions. Reactivation permits a new login but does not
restore old sessions. An administrator cannot suspend or ban their own account.
Valid role keys are `user` and `admin`. Administrative edits never accept the
user id, password, registration timestamp, or update timestamp.

## Activities — PAN 21 / CU53

| Method   | Route                       | Permission        | Input                                                                          |
| -------- | --------------------------- | ----------------- | ------------------------------------------------------------------------------ |
| `GET`    | `/api/admin/activities`     | `activity.list`   | `search?`, `type?`, `categoryId?`, pagination; `sortBy=createdAt\|name\|price` |
| `POST`   | `/api/admin/activities`     | `activity.create` | Activity body below                                                            |
| `PATCH`  | `/api/admin/activities/:id` | `activity.update` | Partial activity body                                                          |
| `DELETE` | `/api/admin/activities/:id` | `activity.delete` | — (`204`)                                                                      |

The create body contains `name`, `description`, `estimatedCost`,
`estimatedDuration` (minutes), optional `type`, unique `categoryIds`, and
optional unique `placeIds`. An omitted or empty `placeIds` creates an activity
without a physical location. `categoryIds` and `placeIds` each replace their
assignments when supplied to `PATCH`; omitted fields preserve the current
associations. Existing place associations are retained instead of recreated so
their synchronized Google Maps coordinates, place id, and ratings are not lost.
Rows include category summaries and place summaries (`id`, `name`, `address`).
Google Maps data is managed by external synchronization and is never accepted
from this administration endpoint. Deletion is soft, preserving references
from historical plans.

## Categories — CU54

| Method   | Route                       | Permission        | Input                                                                                  |
| -------- | --------------------------- | ----------------- | -------------------------------------------------------------------------------------- |
| `GET`    | `/api/admin/categories`     | `category.list`   | `search?`, `status?=active\|inactive`, pagination; `sortBy=createdAt\|name\|status` |
| `POST`   | `/api/admin/categories`     | `category.create` | `{ "name", "description"? }`                                                        |
| `PATCH`  | `/api/admin/categories/:id` | `category.update` | Any of `name`, `description`, or `status=active\|inactive`                            |
| `DELETE` | `/api/admin/categories/:id` | `category.delete` | — (`204`)                                                                              |

Administrative rows include `id`, `name`, `description`, `status`, `createdAt`,
and `updatedAt`. Names are trimmed, 1–80 characters, and unique without
distinguishing case. Descriptions are optional, trimmed text of 1–500 characters;
`null` clears one during `PATCH`. New categories start `active`.

Inactive categories remain attached to historical activities, preferences, and
plan requests, but are excluded from public filters and recommendations. They
cannot be assigned to an activity through the administration API (`422
CATEGORY_NOT_AVAILABLE`). `DELETE` is a soft deletion and fails with `409
CATEGORY_IN_USE` while active activity, user-preference, or plan-request
associations exist.

## Ratings — PAN 20 / CU55

| Method  | Route                               | Permission        | Input                                                                        |
| ------- | ----------------------------------- | ----------------- | ---------------------------------------------------------------------------- |
| `GET`   | `/api/admin/ratings`                | `rating.moderate` | `status?=pending\|approved\|rejected`, pagination; `sortBy=createdAt\|score` |
| `PATCH` | `/api/admin/ratings/:id/moderation` | `rating.moderate` | `{ "status": "approved" }` or `{ "status": "rejected", "reason": "..." }`    |
| `DELETE` | `/api/admin/ratings/:id`            | `content.delete`  | `{ "reason"? }` (`204`)                                                     |

Rows include the safe rating projection, `activityId`, `planId`, moderation
fields, and the author's `id`, `name`, and `lastName`. A rejection reason is
required and limited to 500 characters.

## Permissions — CU61

| Method   | Route                              | Permission          | Input                                                       |
| -------- | ---------------------------------- | ------------------- | ----------------------------------------------------------- |
| `GET`    | `/api/admin/permissions`           | `permission.list`   | `search?`, pagination; `sortBy=createdAt\|key\|name`       |
| `GET`    | `/api/admin/permissions/:id`       | `permission.list`   | —                                                           |
| `POST`   | `/api/admin/permissions`           | `permission.assign` | `{ "key", "name", "description"? }`                      |
| `PATCH`  | `/api/admin/permissions/:id`       | `permission.assign` | Any of `name` or `description` (`null` clears description) |
| `DELETE` | `/api/admin/permissions/:id`       | `permission.assign` | — (`204`)                                                  |
| `GET`    | `/api/admin/roles`                 | `permission.assign` | `search?`, pagination; `sortBy=createdAt\|key\|name`       |
| `PUT`    | `/api/admin/roles/:id/permissions` | `permission.assign` | `{ "permissionIds": [1, 2] }`                            |

Permission rows include safe summaries of assigned roles, so clients can
choose a role without using CU62's future role-management API. `GET
/api/admin/roles` with `permission.assign` returns all roles, including roles
with zero permissions, so clients can always discover the numeric role id for
the replacement endpoint. New keys use
immutable lower-case `resource.action` format and are assigned to `admin`
automatically. Replacing a non-admin role's permissions is atomic and
idempotent. The admin role always has every active permission and cannot be
changed with the replacement endpoint.

Deletion is soft and revokes active role assignments in the same transaction.
`permission.list` and `permission.assign` are protected with `409
CORE_PERMISSION_PROTECTED`. Permissions are loaded from active database
assignments on every protected request, so a revocation affects already-issued
access tokens immediately. Every actual change is audited with the
administrator actor.

An administrator may soft-delete a rating that violates the rules. The optional
deletion reason is trimmed text of 1–500 characters when provided. The audit
record stores the affected rating, the administrator actor, the reason, and the
action timestamp; deleted ratings no longer appear in public, owner, or
administrative listings.

## User feedback — CU59

| Method  | Route                            | Permission        | Input                                                                                   |
| ------- | -------------------------------- | ----------------- | --------------------------------------------------------------------------------------- |
| `GET`   | `/api/admin/feedback`            | `feedback.review` | `status?=pending\|processed\|discarded`, pagination; `sortBy=createdAt\|rating\|status` |
| `PATCH` | `/api/admin/feedback/:id/review` | `feedback.review` | `{ "status": "processed" \| "discarded", "note"?: "..." }`                              |

The listing defaults to `pending`. Each row returns its score, tags, optional
comment and actual cost/duration, the feedback status, timestamps, the plan
`id` and `title`, and the submitting author's `id`, `name`, `lastName`, and
`email`. It never exposes credentials or session data.

An administrator may mark feedback `processed` or `discarded`; a later review
may correct either outcome. A review note is optional and, when present, is
trimmed text of 1–500 characters stored only in the audit event. Repeating the
same status is idempotent and creates no extra audit event. Each real status
change records the prior and new status, optional note, administrator actor,
and timestamp in `audit_log`.

## Plans — PAN 22 / CU60

| Method   | Route                  | Permission    | Input                                                                     |
| -------- | ---------------------- | ------------- | ------------------------------------------------------------------------- |
| `GET`    | `/api/admin/plans`     | `plan.manage` | `search?`, `status?`, pagination; `sortBy=createdAt\|title\|status\|cost` |
| `PATCH`  | `/api/admin/plans/:id` | `plan.manage` | Any of `title`, `description`, `peopleCount`, `status`                    |
| `DELETE` | `/api/admin/plans/:id` | `plan.manage` | — (`204`)                                                                 |

Valid status keys are `generated`, `selected`, `confirmed`, `completed`, and
`cancelled`. Rows include owner identity, status, totals, people and activity
counts, and timestamps. Deletion is soft.

## Dashboard — REP-01 / CU58

`GET /api/admin/metrics?range=today|7d|30d|month` requires `metric.view` and
defaults to `30d`. It returns:

- all-time KPIs: total users, non-cancelled active plans, catalog activities,
  and pending ratings;
- range-based acceptance rate (`approved / (approved + rejected)`), average of
  approved ratings, and retention (`users with at least two plans / total
users`);
- range-based outing-type and group-size distributions;
- the five activities included in the most distinct plans; and
- the ten most recent audit entries, each with a resolved `label` (the
  affected user's full name, the activity's name, or the plan's title —
  looked up including soft-deleted records, so a removed activity still
  shows its name).

Rates and averages are rounded to two decimal places. Empty denominators return
`0`, never `null` or `NaN`.