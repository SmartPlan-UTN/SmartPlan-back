# User Management API

HTTP contract for CU5-CU8. All routes require an access JWT in
`Authorization: Bearer <accessToken>` and use the global `/api` prefix.
Responses never include passwords, password hashes, refresh tokens, or token
hashes.

| Method   | Route                       | Permission                | Success |
| -------- | --------------------------- | ------------------------- | ------- |
| `GET`    | `/api/users/me`             | `profile.view`            | `200`   |
| `PATCH`  | `/api/users/me`             | `profile.update`          | `200`   |
| `PATCH`  | `/api/users/me/password`    | `profile.change-password` | `204`   |
| `DELETE` | `/api/users/me`             | `profile.delete`          | `204`   |
| `GET`    | `/api/users/me/preferences` | `preference.update`       | `200`   |
| `PATCH`  | `/api/users/me/preferences` | `preference.update`       | `200`   |

## Profile (CU5)

`GET /api/users/me` and `PATCH /api/users/me` return:

```json
{
  "id": 1,
  "name": "Ana",
  "lastName": "Pérez",
  "email": "ana@example.com",
  "emailRemindersEnabled": true,
  "role": { "key": "user", "name": "User" },
  "status": { "key": "active", "name": "Active" }
}
```

The update body accepts `name` and `lastName`, both trimmed strings from
1 to 80 characters, plus the optional `phone` and `emailRemindersEnabled`.
Email is the login credential and is not editable here.

`emailRemindersEnabled` (default `true`) turns the inactivity and feedback
reminder emails on or off ([reminder emails](reminder-emails.md), #127).
Omitting it keeps the stored value; `null` is rejected.

## Change password (CU6)

`PATCH /api/users/me/password` accepts:

```json
{
  "currentPassword": "existing-password",
  "newPassword": "New-password1!"
}
```

`currentPassword` is an existing credential and only requires 8-128 characters,
so accounts created before the current policy remain compatible. `newPassword`
must contain 8-128 characters, at least one uppercase letter, at least one
number, and at least one of these symbols: `!@#$%^&*.`. A successful change
returns `200` with refreshed authentication, keeps the current session active,
and revokes the other sessions and pending recovery tokens. An incorrect current password returns `401
INVALID_CURRENT_PASSWORD`.

## Delete account (CU7)

`DELETE /api/users/me` receives the same confirmation body containing
`currentPassword`. On success it returns `204`, performs a soft delete, revokes
all sessions and recovery tokens, and clears the refresh cookie. Associated
content remains preserved for traceability but is no longer accessible through
the deleted account. The email remains reserved and cannot be registered again.

## Preferences (CU8, CU18)

A user's recommendation profile has two parts: the preferred **categories**
(the `user_preference` join) and a **scalar profile** (`user_preference_profile`,
one row per user) with usual budget, usual party size, preferred area, a
"prefer the device location" flag, and a maximum travel distance. PAN 15 edits
both in one form.

`GET /api/users/me/preferences` returns the whole profile:

```json
{
  "categories": [{ "id": 1, "name": "Gastronomy", "description": "..." }],
  "usualBudget": 35000,
  "usualPeopleCount": 3,
  "preferredArea": {
    "label": "Godoy Cruz, Mendoza",
    "placeId": "ChIJ...",
    "latitude": -32.9267,
    "longitude": -68.8417
  },
  "useDeviceLocation": false,
  "maxDistanceKm": 20
}
```

Every scalar is `null` when the user has not set it; `useDeviceLocation` is
`false` until a profile is saved.

`PATCH /api/users/me/preferences` updates the profile with the same shape it
returns:

```json
{
  "categoryIds": [1, 3, 7],
  "usualBudget": 35000,
  "usualPeopleCount": 3,
  "preferredArea": {
    "label": "Godoy Cruz, Mendoza",
    "placeId": "ChIJ...",
    "latitude": -32.9267,
    "longitude": -68.8417
  },
  "useDeviceLocation": false,
  "maxDistanceKm": 20
}
```

- `categoryIds` is **required** and replaces the complete selection. IDs must be
  positive integers without duplicates. An empty list is valid and removes every
  preference. `422 CATEGORY_NOT_AVAILABLE` if any category is missing or inactive.
  Categories deactivated after selection are omitted from reads and removed on the
  next update.
- The five scalar fields are each **optional**: omitting a field leaves its
  stored value untouched; sending an explicit `null` clears it. `usualBudget`
  must be a positive number, `usualPeopleCount` an integer `>= 1`, `maxDistanceKm`
  an integer between `1` and `50`.
- `preferredArea` is a **resolved location**, not free text. The frontend
  confirms what the user typed against `GET /api/external-integration/places/search`
  and sends back `{ label, placeId, latitude, longitude }` (all four required
  together, `latitude`/`longitude` valid coordinates, `label` <= 160 chars). The
  backend stores it verbatim — no billed Maps call on the write path. `label` is
  the display string; `placeId` + coordinates are the machine-usable reference.

Categories and the scalar profile are written in a single transaction.

### Applied during generation (CU17/CU18/CU19)

Automatic generation resolves budget and party size from explicit context, then
interpreted text, then the stored profile. Categories expressed in the request
win; otherwise both automatic and surprise generation use active saved interests.
Surprise generation also inherits usual budget and party size.

The client requests device GPS only when `useDeviceLocation` is enabled. A saved
preferred area is the fallback. `maxDistanceKm` filters candidate venues around a
complete coordinate pair in the resolved department. A different explicitly
requested department does not inherit the saved area's centre. Without usable
coordinates, generation keeps its department filter and reports no applied radius.

The resolved centre and radius are checkpointed with intent, so retries do not
read a newly edited profile for those constraints. Historical resolved requests
retain null radius fields. `GET /plan-requests/:id` exposes
`resolvedContext.appliedMaxDistanceKm` (number or null) alongside resolved
budget, party size, department and categories; the frontend only shows an applied
radius. Distance is straight-line kilometres from the search centre, not total
itinerary travel distance. Empty constrained candidate sets are not widened.

## Errors

All errors follow the common contract in `docs/authentication.md`. Besides DTO
validation (`400 VALIDATION_FAILED`) and authorization (`401`/`403`), this API
uses `INVALID_CURRENT_PASSWORD` and `CATEGORY_NOT_AVAILABLE` as stable frontend
error codes.
