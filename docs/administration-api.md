# Administration API contract

Contract for frontend screens PAN 19–22 and REP-01 (CU53, CU55, CU57, CU58,
and CU60). All routes use the global `/api` prefix, require a bearer access
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
`estimatedDuration` (minutes), optional `type`, and unique `categoryIds`.
`categoryIds` replaces all category assignments when supplied to `PATCH`.
Deletion is soft, preserving references from historical plans.

## Ratings — PAN 20 / CU55

| Method  | Route                               | Permission        | Input                                                                        |
| ------- | ----------------------------------- | ----------------- | ---------------------------------------------------------------------------- |
| `GET`   | `/api/admin/ratings`                | `rating.moderate` | `status?=pending\|approved\|rejected`, pagination; `sortBy=createdAt\|score` |
| `PATCH` | `/api/admin/ratings/:id/moderation` | `rating.moderate` | `{ "status": "approved" }` or `{ "status": "rejected", "reason": "..." }`    |

Rows include the safe rating projection, `activityId`, `planId`, moderation
fields, and the author's `id`, `name`, and `lastName`. A rejection reason is
required and limited to 500 characters.

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
