# Planning API

Private planning contract for CU24-CU31. The existing public exploration routes
(`GET /api/plans` and `GET /api/plans/:id`) remain unchanged. Routes in this
document require an access JWT in `Authorization: Bearer <accessToken>`.

## Own plans (CU24-CU30)

| Method | Route | Permission | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/users/me/plans` | `plan.list` | List the authenticated user's plans. |
| `POST` | `/api/users/me/plans` | `plan.create` | Create an empty manual plan. |
| `GET` | `/api/users/me/plans/:id` | `plan.view` | Read an own plan and ordered activities. |
| `PATCH` | `/api/users/me/plans/:id` | `plan.update` | Edit title, description, or people count. |
| `DELETE` | `/api/users/me/plans/:id` | `plan.delete` | Cancel an own plan. |
| `POST` | `/api/users/me/plans/:id/details` | `plan.update` | Add a catalog activity. |
| `DELETE` | `/api/users/me/plans/:id/details/:detailId` | `plan.update` | Remove a plan activity. |

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

`POST /api/plan-suggestions` requires `plan.generate` and validates this body:

```json
{
  "budget": 40000,
  "latitude": -32.8895,
  "longitude": -68.8458,
  "peopleCount": 2,
  "availableDurationMinutes": 300,
  "preferences": ["Gastronomy"],
  "notes": "Optional"
}
```

The route is deliberately provisional: after validation it returns
`501 PLAN_GENERATION_NOT_AVAILABLE` and does not persist a request or plan.
The future recommendation module will implement generation behind this stable
contract.
