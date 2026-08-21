# Authentication and Access Control

API contract for CU1-CU4. DTO validation rejects unknown properties with `400
VALIDATION_FAILED`. Emails are trimmed and normalized to lowercase; passwords
are 12-128 characters and recovery tokens are 32-200 characters.

| Method | Route | Input | Success | Specific errors |
| --- | --- | --- | ---: | --- |
| `POST` | `/api/users` | `name`, `lastName`, `email`, `password` | `201` | `409 EMAIL_ALREADY_REGISTERED` |
| `POST` | `/api/sessions` | `email`, `password` | `201` | `401 INVALID_CREDENTIALS`, `403 ACCOUNT_SUSPENDED`, `403 ACCOUNT_BANNED` |
| `POST` | `/api/sessions/refresh` | Refresh cookie | `200` | `401 MISSING_REFRESH_TOKEN`, `401 INVALID_SESSION`, `401 REFRESH_TOKEN_REUSED` |
| `DELETE` | `/api/sessions` | Optional refresh cookie | `204` | Idempotent |
| `POST` | `/api/password-recoveries` | `email` | `202` | `404 EMAIL_NOT_REGISTERED`, `503 EMAIL_SERVICE_UNAVAILABLE` |
| `PATCH` | `/api/password-recoveries` | `token`, `newPassword` | `204` | `400 INVALID_RECOVERY_TOKEN`, `410 EXPIRED_RECOVERY_TOKEN`, `409 RECOVERY_TOKEN_ALREADY_USED` |

## Session Response

```json
{
  "accessToken": "...",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "user": {
    "id": 1,
    "name": "Ana",
    "lastName": "Pérez",
    "email": "ana@example.com",
    "role": { "key": "user", "name": "Usuario" },
    "permissions": ["profile.view"]
  }
}
```

The refresh token is only the `smartplan_refresh` cookie: `HttpOnly`,
`SameSite=Lax`, `Max-Age=2592000`, and path `/api/sessions`; `Secure` is set in
production. Send the access token in `Authorization: Bearer <token>` and use
`credentials: 'include'` for refresh and logout.

## Security and Limits

- Access JWTs last 15 minutes; rotating refresh JWTs last 30 days.
- Access and refresh tokens use separate secrets, audiences, and claims. Roles
  and permissions are queried from PostgreSQL for protected requests.
- Passwords use Argon2id with 19 MiB, two iterations, and parallelism one.
- Password reset tokens are opaque, single-use, expire after 30 minutes, and
  revoke every user session when used.
- Cookie operations reject an `Origin` other than `FRONTEND_URL` with
  `ORIGIN_NOT_ALLOWED`.
- Rate limits: login 10/minute per IP and email; registration 20/hour per IP;
  recovery 10/hour per IP and email; reset 10/hour per IP; refresh 60/minute
  per IP and session. The in-memory limiter requires shared storage before
  horizontal API scaling.
