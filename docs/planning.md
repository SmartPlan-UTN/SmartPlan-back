# Planning API

Private planning contract for CU24-CU31. The exploration listing
(`GET /api/plans`) remains public, while the detail (`GET /api/plans/:id`) and
the routes in this document require an access JWT in
`Authorization: Bearer <accessToken>`.

## Own plans (CU24-CU30)

| Method   | Route                                       | Permission    | Purpose                                   |
| -------- | ------------------------------------------- | ------------- | ----------------------------------------- |
| `GET`    | `/api/users/me/plans`                       | `plan.list`   | List the authenticated user's plans.      |
| `POST`   | `/api/users/me/plans`                       | `plan.create` | Create an empty manual plan.              |
| `GET`    | `/api/users/me/plans/:id`                   | `plan.view`   | Read an own plan and ordered activities.  |
| `PATCH`  | `/api/users/me/plans/:id`                   | `plan.update` | Edit title, description, or people count. |
| `DELETE` | `/api/users/me/plans/:id`                   | `plan.delete` | Cancel an own plan.                       |
| `POST`   | `/api/users/me/plans/:id/details`           | `plan.update` | Add a catalog activity.                   |
| `DELETE` | `/api/users/me/plans/:id/details/:detailId` | `plan.update` | Remove a plan activity.                   |
| `PATCH`  | `/api/users/me/plans/:id/visibility`        | `plan.update` | Publish the plan or make it private.      |
| `GET`    | `/api/activity-suggestions`                 | `plan.create` | "Recomendar actividades" for the editor.  |

These routes cover only plans the person **authored** (`kind = 'authored'`).
Generated results and outings are not listed here and answer `404` on these
routes; outings have their own [API](outings-api.md).

### Publishing

A plan starts `private`. `PATCH /api/users/me/plans/:id/visibility` with
`{ "visibility": "public" }` publishes it: it then appears in exploration and
recommendations and anyone can choose it as an outing. `"private"` hides it
again; outings already copied from it are unaffected. Publishing an empty
plan answers `409 PLAN_EMPTY`, and a cancelled one `409 PLAN_CANCELLED`. A
published plan always keeps an activity: removing its last one also answers
`409 PLAN_EMPTY`, so the author makes it private first. Summaries include
`visibility`.

### Activity suggestions

`GET /api/activity-suggestions?title=...&description=...&excludeActivityIds=3,8`
returns up to six catalog activities matching the words of the title and
description (PostgreSQL full-text search, Spanish configuration, over each
activity's name, categories, and description), preferring the departments of
the excluded (already added) activities. It is stateless, so the editor uses it
while creating or editing. It never calls Gemini: the API does not make
synchronous Gemini calls.

### Composer assistant

Help for the person building a plan by hand (`plan.create`). The person stays
the author: these endpoints are stateless and read-only and answer with
proposals; nothing here creates, adds or reorders anything.

- `POST /api/users/me/plans/assistant/search` with
  `{ "query": "algo para comer cerca del museo, barato y tranquilo", "stopActivityIds": [1, 4] }`
  resolves a sentence to real catalog activities, each with a short reason, plus
  the chips that say what was understood (a price ceiling, "near X", qualities).
- `POST /api/users/me/plans/assistant/suggest` with
  `{ "title", "description?", "stopActivityIds" }` returns up to four activities
  that complement the route and, when the route is dominated by one category,
  the kind of activity it lacks.
- `POST /api/users/me/plans/assistant/improve` with
  `{ "title", "stopActivityIds" }` (at least two, in order) returns at most three
  proposals (`reorder`, `add`, `remove`), each with its computed effect
  (`minutes`, `cost`, `km`).

Gemini only judges meaning (affinity, intent, why). The API computes everything
checkable (distances, durations, costs, the single-day limit, that a reorder is
a permutation) and resolves every id the model returns against the catalog, so
the model cannot introduce an activity, price, place or opening hour. Answers
that fail those checks are dropped. Calls are synchronous with a 7 s timeout;
when the model is slow or unavailable they answer `503 ASSISTANT_UNAVAILABLE`
and the composer keeps working with its regular search (see `decisions.md`).

The owner is always taken from the JWT. The API never accepts `userId` in a
request body and responds `404 PLAN_NOT_FOUND` when a plan does not belong to
the authenticated user.

### Create and update

`POST /api/users/me/plans` accepts:

```json
{
  "title": "Saturday in Mendoza",
  "description": "Optional notes for the whole plan",
  "peopleCount": 2
}
```

`title` is required and must be 1-150 characters after trimming. `description`
is optional (or `null`) and supports up to 2,000 characters. `peopleCount` is
an integer from 1 to 1,000. The plan begins empty with status `confirmed`.

`PATCH /api/users/me/plans/:id` accepts one or more of the same fields. An
empty body returns `400 PLAN_UPDATE_EMPTY`.

### Activities and totals

Add a single catalog activity:

```json
{ "activityId": 42 }
```

The API copies the activity's current `estimatedCost` and `estimatedDuration`
into the plan detail. This snapshot is retained if the catalog activity changes
later. Activities are appended in order and the same activity cannot be added
twice to a plan (`409 ACTIVITY_ALREADY_IN_PLAN`). Removing an activity closes
the ordering gap and recalculates all totals.

**Duration (open business decision).** Nothing in the requirements or the
domain says that a plan must fit in one day: plans carry no date, outings are
"por hacer" without one, and the product vision also talks about trip planning.
So the API does **not** limit the total duration of a plan, nor the number of
stops. The manual composer shows guidance instead: a plan over 8 h is flagged as
an intense day, and one over 24 h is flagged as longer than a day, asking for an
explicit "Revisar igual". If the business decides that a plan is a
single-day outing, the rule belongs here (a validation on the composer and
`POST /users/me/plans/:id/details`) and the front-end guidance becomes blocking.

All private plan responses include the cost calculation:

```json
{
  "id": 1,
  "title": "Saturday in Mendoza",
  "description": null,
  "estimatedTotalCost": 125.5,
  "estimatedTotalDuration": 90,
  "peopleCount": 2,
  "estimatedCostPerPerson": 62.75,
  "activityCount": 1,
  "status": { "key": "confirmed", "name": "Confirmed" },
  "details": [
    {
      "id": 3,
      "order": 1,
      "estimatedCost": 125.5,
      "estimatedDuration": 90,
      "activity": {
        "id": 42,
        "name": "Winery visit",
        "description": "...",
        "estimatedCost": 125.5,
        "estimatedDuration": 90,
        "type": "guided-tour"
      }
    }
  ]
}
```

`estimatedCostPerPerson` is the total divided by `peopleCount`, rounded to two
decimal places. `GET /api/users/me/plans` returns the same summary fields in
the standard paginated envelope and includes cancelled plans as read-only
history.

### Cancellation

`DELETE /api/users/me/plans/:id` is a logical cancellation, not a physical
delete: it sets status to `cancelled`, preserves the plan and its details for
traceability, and returns `204 No Content`. A cancelled plan remains readable
by its owner but cannot be edited or have activities added or removed
(`409 PLAN_CANCELLED`).

### Errors

In addition to the common `400 VALIDATION_FAILED`, `401`, and `403` contract,
the module uses `PLAN_NOT_FOUND`, `PLAN_DETAIL_NOT_FOUND`, `ACTIVITY_NOT_FOUND`,
`ACTIVITY_ALREADY_IN_PLAN`, `PLAN_CANCELLED`, and `PLAN_UPDATE_EMPTY`.

## Suggested plans (CU31)

CU31 is the plan composer's assistant: see [Composer assistant](#composer-assistant).
It suggests real catalog activities for the draft being edited, never creates,
changes or publishes a plan, and stays separate from CU17/CU19 generation. The
provisional `POST /api/plan-suggestions` route (which always answered
`501 PLAN_GENERATION_NOT_AVAILABLE`) was removed in its favour.
