# Outings API ("Mis salidas", CU22 / CU23)

A `plan` row is one of three kinds (`plan.kind`, SmartPlan-back#98):

| Kind        | What it is                                                     | Where it shows                   |
| ----------- | -------------------------------------------------------------- | -------------------------------- |
| `authored`  | Created by a person (CU24). Private until its author publishes it. | "Mis planes"; Explorar and recommendations once `public` |
| `generated` | One alternative returned by a plan request (CU17, CU19).       | Only the request's results, only to the requester |
| `outing`    | A person's frozen copy of a plan they chose to do (CU22).      | "Mis salidas"                    |

Choosing a plan ("Lo voy a hacer") **copies** it: title, description, people
count, totals, travel estimates, and every activity with its order, cost,
duration, and note. The author can edit, unpublish, or cancel the original
afterwards; existing outings do not change, and whoever chooses the plan later
gets the updated version. `plan.id_source_plan` keeps the link.

## Endpoints

All routes require authentication and `plan.select`, and act only on the
caller's outings: another person's outing answers `404 OUTING_NOT_FOUND`.

| Method   | Route                              | Purpose                                            |
| -------- | ---------------------------------- | -------------------------------------------------- |
| `POST`   | `/api/users/me/outings`            | "Lo voy a hacer": `{ "sourcePlanId": 12 }`         |
| `GET`    | `/api/users/me/outings`            | List, `?status=to_do\|completed&page&limit` plus the filters below |
| `GET`    | `/api/users/me/outings/:id`        | Detail with the frozen itinerary and its places    |
| `PATCH`  | `/api/users/me/outings/:id/complete` | "Marcar como realizada" (idempotent)             |
| `POST`   | `/api/users/me/outings/:id/repeat` | "Volver a hacer este plan"                         |
| `DELETE` | `/api/users/me/outings/:id`        | Cancel an outing still to do (`204`)               |

### Filtering "Mis salidas"

`GET /api/users/me/outings` also takes these optional query parameters (#134),
combined with `AND` and applied before paginating:

| Parameter | Values | Meaning |
| --------- | ------ | ------- |
| `search`  | 1–200 characters | The title or the name of any activity contains it (case-insensitive; `%` and `_` match themselves) |
| `from`, `to` | `YYYY-MM-DD` | Inclusive calendar days in `America/Argentina/Mendoza`, on when the outing was done, or chosen while still to do |
| `rated`   | `true` \| `false` | Only outings with or without feedback |
| `sort`    | `recent` (default) \| `oldest` \| `cost_desc` \| `cost_asc` | Order; `id` breaks ties so pages stay stable |

An invalid value answers `400 VALIDATION_FAILED`.

### Choosing a plan

A person may choose their own `authored` plan (private or public), their own
`generated` result, or another person's **published** `authored` plan. Any
other plan answers `404 PLAN_NOT_FOUND`, exactly like a missing one, so an id
reveals nothing. An outing is never a source (`409 PLAN_NOT_ACTIONABLE`).

`POST` answers `201` with `{ "created": true, "outing": { ... } }`. It is
idempotent while that outing is still to do: a double click, a retry, or a
concurrent request answers `200` with `created: false` and the same outing.
The partial unique index `IDX_plan_active_outing_unique`
(`id_user, id_source_plan` where `kind = 'outing'`, not completed, not
deleted) guarantees one outing to do per person and plan, even under
concurrency. Choosing never changes the source plan.

`GET /api/plans/:id`, generation results, exploration, and recommendations
expose the caller's view of each plan:

- `viewerPlanState`: `selectable`, `selected` (an outing to do exists), or
  `view-only` (anonymous, cancelled, an outing, or not choosable);
- `activeOutingId`: that outing's id, so the client can link to it, or `null`.

There is no "un-choose" on the plan: the outing is cancelled from "Mis
salidas".

### Lifecycle and feedback

```json
{
  "id": 40,
  "title": "Día de viñedos",
  "status": "to_do",
  "completedAt": null,
  "feedbackState": "not_available",
  "feedback": null,
  "activityNames": ["Bodega boutique", "Almuerzo de campo"],
  "source": { "id": 12, "kind": "authored", "title": "Día de viñedos", "available": true },
  "peopleCount": 2,
  "estimatedTotalCost": 150,
  "estimatedCostPerPerson": 75,
  "estimatedTotalDuration": 150,
  "activityCount": 2,
  "createdAt": "2026-09-30T12:00:00.000Z"
}
```

- `to_do` → `completed` through `PATCH .../complete`, which records
  `completedAt` once and keeps it on repeat calls. It never touches the source
  plan or anyone else's outing.
- `feedbackState` is `not_available` while to do, `available` **immediately**
  after completion, and `submitted` once feedback exists. The window never
  closes.
- Feedback is submitted with `POST /api/plans/:id/feedback` using the outing
  id (one per outing; see [Ratings](ratings.md) for per-activity ratings).
  Feedback on a plan that is not an outing answers
  `409 FEEDBACK_REQUIRES_OUTING`; before completion,
  `409 FEEDBACK_NOT_YET_AVAILABLE`.
- 24 hours after completion without feedback, the worker's
  `FeedbackNotificationScheduler` creates exactly one in-app notification
  (`resourceType: 'outing'`, `resourceId`: the outing id). It is only a
  reminder. See [Notifications](#notifications).
- `DELETE` cancels (soft-deletes) an outing still to do. A completed outing is
  history and answers `409 OUTING_ALREADY_COMPLETED`.
- `source.available` says whether the person can still open the original; it
  turns `false` when the author unpublishes or cancels it.

### Doing a plan again

`POST .../repeat` creates a new outing to do and leaves the earlier ones and
their feedback untouched. It copies the original again when the person can
still choose it (so they get its current version); otherwise it copies the
outing's own frozen itinerary. The same one-to-do-per-plan rule applies.

## Notifications

| Method  | Route                                  | Permission          |
| ------- | -------------------------------------- | ------------------- |
| `GET`   | `/api/users/me/notifications`          | `notification.list` |
| `PATCH` | `/api/users/me/notifications/:id/read` | `notification.read` |

The list is paginated, newest first, accepts `?unread=true`, and adds
`unreadCount` for the badge. Marking as read is idempotent and keeps the first
`readAt`. Another person's notification answers `404 NOTIFICATION_NOT_FOUND`.
