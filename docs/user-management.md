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
  "role": { "key": "user", "name": "User" },
  "status": { "key": "active", "name": "Active" }
}
```

The update body accepts only `name` and `lastName`, both trimmed strings from
1 to 80 characters. Email is the login credential and is not editable here.

## Change password (CU6)

`PATCH /api/users/me/password` accepts:

```json
{
  "currentPassword": "current-password-with-at-least-12-characters",
  "newPassword": "new-password-with-at-least-12-characters"
}
```

Both passwords must be 12-128 characters. A successful change returns `204`,
revokes every active session and pending recovery token, and requires a new
login. An incorrect current password returns `401 INVALID_CURRENT_PASSWORD`.

## Delete account (CU7)

`DELETE /api/users/me` receives the same confirmation body containing
`currentPassword`. On success it returns `204`, performs a soft delete, revokes
all sessions and recovery tokens, and clears the refresh cookie. Associated
content remains preserved for traceability but is no longer accessible through
the deleted account. The email remains reserved and cannot be registered again.

## Preferences (CU8)

`GET /api/users/me/preferences` returns selected active categories:

```json
{
  "categories": [{ "id": 1, "name": "Gastronomy", "description": "..." }]
}
```

`PATCH /api/users/me/preferences` replaces the complete selection:

```json
{ "categoryIds": [1, 3, 7] }
```

IDs must be positive integers without duplicates. An empty list is valid and
removes every preference. The API rejects the entire update with
`422 CATEGORY_NOT_AVAILABLE` if any requested category is missing or inactive.
Categories deactivated after selection are omitted from reads and removed on
the next preference update.

## Errors

All errors follow the common contract in `docs/authentication.md`. Besides DTO
validation (`400 VALIDATION_FAILED`) and authorization (`401`/`403`), this API
uses `INVALID_CURRENT_PASSWORD` and `CATEGORY_NOT_AVAILABLE` as stable frontend
error codes.
