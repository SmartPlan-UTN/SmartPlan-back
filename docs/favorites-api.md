# Favorites contract

HTTP contract implemented for CU15 and CU39-CU43. All routes use the global
`/api` prefix and require an authenticated user: favorites always belong to
the owner of the token, never to a user identified in the URL or the body.

Every user owns a single `favorite_list`, created the first time they save
something. The list is an implementation detail: it is not exposed by any
route and the client never sends its id.

## Endpoints

| Method   | Route                                | Permission        | CU   |
| -------- | ------------------------------------ | ----------------- | ---- |
| `GET`    | `/api/favorite-activities`           | `favorite.list`   | CU39 |
| `POST`   | `/api/favorite-activities`           | `favorite.save`   | CU15 |
| `DELETE` | `/api/favorite-activities/:idActivity` | `favorite.remove` | CU41 |
| `GET`    | `/api/favorite-plans`                | `favorite.list`   | CU40 |
| `POST`   | `/api/favorite-plans`                | `favorite.save`   | CU43 |
| `DELETE` | `/api/favorite-plans/:idPlan`        | `favorite.remove` | CU42 |

`DELETE` identifies the favorite by the id of the saved activity or plan, not
by the id of the membership row: the client already holds the first one when it
renders an activity card or a plan card, so removing never needs an extra
lookup. Both return `204` with an empty body.

**Removing a favorite never deletes the saved entity.** It soft-removes the
`favorite_activity` or `favorite_plan` row; the activity and the plan stay
untouched and remain reachable through `/api/activities/:id` and
`/api/plans/:id`. Because the unique indexes exclude soft-removed rows, the
same activity or plan can be saved again afterwards.

## Listings

Both listings follow the standard pagination convention (`page`, `limit`,
`sortBy`, `direction`) and return the shared `{ data, pagination }` envelope.
The default order is the most recently saved first.

| Listing                    | `sortBy`                                | Default    |
| -------------------------- | --------------------------------------- | ---------- |
| `/api/favorite-activities` | `savedAt`, `name`, `estimatedCost`      | `savedAt`  |
| `/api/favorite-plans`      | `savedAt`, `title`, `estimatedTotalCost` | `savedAt` |

`direction` defaults to `desc` and `id` is always the tie-breaker, so a
favorite cannot move between pages when two values match.

A user who never saved anything gets an empty page, not a `404`.

## Payloads

`POST /api/favorite-activities` takes `{ "idActivity": 12 }` and
`POST /api/favorite-plans` takes `{ "idPlan": 7 }`. Both return the created
favorite:

```json
{
  "id": 34,
  "idActivity": 12,
  "savedAt": "2026-08-24T18:30:00.000Z",
  "activity": {
    "id": 12,
    "name": "Wine tasting",
    "description": "Guided tasting in a local winery",
    "estimatedCost": 45,
    "estimatedDuration": 90,
    "type": "gastronomy"
  }
}
```

```json
{
  "id": 35,
  "idPlan": 7,
  "savedAt": "2026-08-24T18:30:00.000Z",
  "plan": {
    "id": 7,
    "title": "Weekend in Mendoza",
    "description": null,
    "estimatedTotalCost": 120,
    "estimatedTotalDuration": 300,
    "peopleCount": 2,
    "activityCount": 3,
    "status": { "key": "confirmed", "name": "Confirmada" }
  }
}
```

The embedded activity and plan carry what a favorites card needs. Ratings,
categories, locations, and the itinerary are not repeated here: they come from
`/api/activities/:id` and `/api/plans/:id`, which is why saving a favorite does
not duplicate the exploration contract.

## Errors

The common error contract applies (`statusCode`, `code`, `message`, `path`,
`timestamp`). Specific codes:

| Status | `code`                        | When                                            |
| ------ | ----------------------------- | ----------------------------------------------- |
| `404`  | `ACTIVITY_NOT_FOUND`          | Saving an activity that does not exist          |
| `404`  | `PLAN_NOT_FOUND`              | Saving a plan that does not exist               |
| `404`  | `FAVORITE_ACTIVITY_NOT_FOUND` | Removing an activity that is not saved          |
| `404`  | `FAVORITE_PLAN_NOT_FOUND`     | Removing a plan that is not saved               |
| `409`  | `ACTIVITY_ALREADY_IN_FAVORITES` | Saving an activity already in favorites       |
| `409`  | `PLAN_ALREADY_IN_FAVORITES`   | Saving a plan already in favorites              |

Favorites of another user are invisible: removing one answers with the same
`404` as removing something that was never saved.
