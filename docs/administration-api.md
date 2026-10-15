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
| `PATCH` | `/api/admin/users/:id/status` | `user.change-status` | `{ "status": "active" \| "suspended" }`                                         |

User rows contain `id`, `name`, `lastName`, `email`, `role`, `status`,
`createdAt`, and `updatedAt`. Suspending an account immediately revokes all its
active sessions. Reactivation permits a new login but does not restore old
sessions. An administrator cannot suspend their own account.
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

## Reported content — PAN 20 / #156

Ratings, shared experience comments and shared experience photos are
published at once. Any authenticated user can report someone else's content;
the first report hides it from everyone but its author (`under_review`), and
an administrator keeps it or removes it. A report about content already kept
is queued without hiding it again.

| Method  | Route                                          | Permission         | Input                                                                                                 |
| ------- | ---------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------- |
| `POST`  | `/api/content-reports`                         | `content.report`   | `{ contentType, contentId, reason, detail? }`; `detail` (≤ 500) is required when `reason` is `other` |
| `GET`   | `/api/admin/content-reports`                   | `content.moderate` | `type?`, pagination; `sortBy=firstReportedAt\|reportCount`                                          |
| `GET`   | `/api/admin/content-reports/:type/:contentId`  | `content.moderate` | —                                                                                                     |
| `PATCH` | `/api/admin/content-reports/:type/:contentId`  | `content.moderate` | `{ "decision": "keep" }` or `{ "decision": "remove", "reason": "..." }` (`204`)                       |
| `DELETE` | `/api/admin/ratings/:id`                      | `content.delete`   | `{ "reason"? }` (`204`, CU56)                                                                         |

`contentType` is `rating`, `experience_comment` (a feedback id) or
`experience_photo` (a `plan_image` id); `reason` is `harassment`,
`hate_speech`, `sexual_content`, `violence`, `spam` or `other`. Reporting
answers `403 CONTENT_REPORT_OWN_CONTENT` for one's own content, `409
CONTENT_REPORT_DUPLICATE` while the same user's earlier report is still open
(once an administrator decides, they may report it again), and `404
CONTENT_NOT_FOUND` for content that is gone, removed or no longer shared.

The queue groups open reports by content, with `reportCount`,
`firstReportedAt`, `lastReportedAt`, `previouslyKept` and a `content`
preview (text or photo, score, author, and the rated activity or reviewed
plan); `content` is `null` when its author deleted it. The detail adds every
open report with `system` (`true` for the reports the migration raised for
ratings automatic moderation had held) and its reporter (`null` for those,
and for a user whose account was deleted since). Resolving closes every
open report of that content, records the administrator in the audit log, and,
on `remove`, notifies the author with the reason; `404
CONTENT_REPORT_NOT_FOUND` means there was nothing open to resolve.

## Permissions — CU61

| Method   | Route                              | Permission          | Input                                                       |
| -------- | ---------------------------------- | ------------------- | ----------------------------------------------------------- |
| `GET`    | `/api/admin/permissions`           | `permission.list`   | `search?`, pagination; `sortBy=createdAt\|key\|name`       |
| `GET`    | `/api/admin/permissions/:id`       | `permission.list`   | —                                                           |
| `POST`   | `/api/admin/permissions`           | `permission.assign` | `{ "key", "name", "description"? }`                      |
| `PATCH`  | `/api/admin/permissions/:id`       | `permission.assign` | Any of `name` or `description` (`null` clears description) |
| `DELETE` | `/api/admin/permissions/:id`       | `permission.assign` | — (`204`)                                                  |
| `GET`    | `/api/admin/roles`                 | `role.list`         | `search?`, pagination; `sortBy=createdAt\|key\|name`       |
| `POST`   | `/api/admin/roles`                 | `role.create`       | `{ "key", "name", "description"? }`                     |
| `PATCH`  | `/api/admin/roles/:id`             | `role.update`       | Any of `name` or `description` (`null` clears description)  |
| `DELETE` | `/api/admin/roles/:id`             | `role.delete`       | — (`204`)                                                    |
| `PUT`    | `/api/admin/roles/:id/permissions` | `permission.assign` | `{ "permissionIds": [1, 2] }`                            |

Permission rows include safe summaries of assigned roles. `GET
/api/admin/roles` returns all roles, including roles with zero permissions, so
clients can always discover the numeric role id for the replacement endpoint.
Custom role keys use immutable lower-case kebab-case format. Role creation and
editing deliberately do not assign permissions; `PUT /roles/:id/permissions`
does that atomically and idempotently. The system roles `admin` and `user` are
immutable, including their permission assignments. A custom role cannot be
deleted while active users are assigned to it; deleting an unused role
soft-deletes its active permission assignments in the same transaction.

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

| Method   | Route                  | Permission    | Input                                                                                             |
| -------- | ---------------------- | ------------- | ------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/admin/plans`     | `plan.manage` | `search?`, `status?`, `kind?`, `visibility?`, pagination; `sortBy=createdAt\|title\|status\|cost` |
| `PATCH`  | `/api/admin/plans/:id` | `plan.manage` | Any of `title`, `description`, `peopleCount`, `status`                                            |
| `DELETE` | `/api/admin/plans/:id` | `plan.manage` | — (`204`)                                                                                         |

Valid status keys are `generated`, `selected`, `confirmed`, `completed`, and
`cancelled`. Valid `kind` values are `authored`, `generated`, and `outing`;
valid `visibility` values are `private` and `public`. Rows include owner
identity, status, kind, visibility, totals, people and activity counts, and
timestamps. Deletion is soft.

The list covers every kind of plan from every user. Status and visibility are
independent, so a `completed` status never publishes a plan (#160). Each row
also says whether Explorar (`GET /api/plans`) lists it right now:
`listedInExplore`, and `exploreHiddenCause` (`generated`, `outing`, `private`,
or `cancelled`; `null` when listed). Both come from the same rule as the
Explorar search (`EXPLORE_LISTING` in `src/plans/plan-selectability.ts`), so
clients should show them instead of rebuilding it.

## Dashboard — REP-01 / CU58

`GET /api/admin/metrics?range=today|7d|30d|month` requires `metric.view` and
defaults to `30d`. It returns:

- all-time KPIs: total users, non-cancelled active plans, catalog activities,
  and content with open reports (`openReports`);
- range-based acceptance rate (`public / (public + removed)` ratings; those
  under review are not decided yet), average of public ratings, and retention (`users with at least two plans / total
users`);
- range-based outing-type and group-size distributions;
- the five activities included in the most distinct plans; and
- the ten most recent audit entries, each with a resolved `label` (the
  affected user's full name, the activity's name, or the plan's title —
  looked up including soft-deleted records, so a removed activity still
  shows its name).

Rates and averages are rounded to two decimal places. Empty denominators return
`0`, never `null` or `NaN`.

### CSV export

`GET /api/admin/metrics/export?range=today|7d|30d|month&format=csv` requires
the same administrator role and `metric.view` permission. Defaults are `30d`
and `csv`; invalid ranges, formats, and unknown query properties return `400`.

The export calls the dashboard calculation once. Its CSV includes generation
time, the selected period and exact bounds, all KPIs, performance, both
distributions with counts and percentages, the three popular activities visible
in the panel, and the ten recent audit entries. Labels are in Spanish; dates
are ISO 8601. All-time KPIs retain their existing meaning, regardless of range.

The file uses UTF-8 with BOM, semicolon separators, comma decimals, CRLF rows,
quoted text, and escaped quotes. Formula-like text is prefixed with an
apostrophe to prevent spreadsheet execution. Empty sections retain headers.
Responses use `Content-Type: text/csv; charset=utf-8`, `Cache-Control: no-store`,
and `Content-Disposition: attachment; filename="smartplan-metricas-<range>-<YYYY-MM-DD>.csv"`.
CORS exposes `Content-Disposition` so the authenticated browser client can
preserve the filename. PDF and XLSX are not supported.

Apply migration `AddAuditExportAction1791840000000` before deploying the endpoint
with synchronization disabled. Each generated report records `action=export`,
the administrator as actor and affected user, and report/range/format/window
metadata in `audit_log`. Audit persistence must succeed before the file is
returned; it records authorized generation, not confirmation of a client save.
The new audit entry is written after calculation and appears in later snapshots.
Migration rollback refuses to remove the enum value while any export audit
records remain.
