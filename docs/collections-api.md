# Collections contract

HTTP contract for CU32-CU38. Every route uses the global `/api` prefix,
requires an authenticated user, and resolves ownership from the access token.
A collection groups activities selected by its owner; it is separate from the
quick favorites list and never contains plans.

## Create a collection (CU32)

`POST /api/collections` accepts:

```json
{
  "nameCollection": "Bodegas para visitar",
  "description": "Ideas para una salida de fin de semana"
}
```

`nameCollection` is required, trimmed, and limited to 100 characters.
`description` is optional, trimmed, and limited to 500 characters; an omitted
or blank description is stored and returned as `null`.

The successful `201` response is the new collection detail:

```json
{
  "id": 12,
  "nameCollection": "Bodegas para visitar",
  "description": "Ideas para una salida de fin de semana",
  "savedAt": "2026-08-25T18:30:00.000Z",
  "activityCount": 0,
  "createdAt": "2026-08-25T18:30:00.000Z",
  "updatedAt": "2026-08-25T18:30:00.000Z",
  "activities": []
}
```

Names are unique within the authenticated user's active collections. An exact
duplicate returns `409` with `code: "COLLECTION_NAME_ALREADY_EXISTS"`. Different
users may use the same name.

## Remaining endpoints

| Method   | Route                                          | Purpose                       |
| -------- | ---------------------------------------------- | ----------------------------- |
| `GET`    | `/api/collections`                             | List the owner's collections  |
| `GET`    | `/api/collections/:id`                         | Get an owned collection       |
| `PATCH`  | `/api/collections/:id`                         | Update name or description    |
| `DELETE` | `/api/collections/:id`                         | Soft-delete a collection      |
| `POST`   | `/api/collections/:id/activities`              | Add an activity               |
| `DELETE` | `/api/collections/:id/activities/:idActivity`  | Remove an activity            |

Foreign collections use the same `404 / COLLECTION_NOT_FOUND` response as a
missing collection. Removing an activity from a collection only removes the
membership; it does not delete the activity or change its favorite state.
