# Plan intention contract (CU22 / PAN 11 · PAN 17)

CU22 records the authenticated viewer's reversible intention to do a plan. It
is not a favourite, ownership, confirmation, completion, or a global plan
status. Intentions are stored independently in `plan_intention`, uniquely per
`(id_user, id_plan)`, with `created_at` available for the later CU23 prompt.

## Endpoints

| Method | Route | Purpose |
| --- | --- | --- |
| `PATCH` | `/api/plans/:id/select` | Create the caller's intention |
| `DELETE` | `/api/plans/:id/select` | Withdraw the caller's intention |

Both require authentication, have no body, are idempotent, and return `200`.
Neither endpoint changes `plan.status` or another user's intention. Ownership
and visibility do not apply: **any authenticated user may intend any plan that
is not `cancelled`** (a soft-deleted plan `404`s before the check). `PATCH`
returns `409 PLAN_NOT_ACTIONABLE` for a `cancelled` plan.

```json
{
  "id": 42,
  "planRequestId": null,
  "status": { "key": "completed", "name": "Completado" },
  "viewerPlanState": "selected"
}
```

`viewerPlanState` is `selectable`, `selected`, or `view-only`. It is computed
from the caller's active `plan_intention` and the plan's status, never from
`plan.id_user` or `plan.visibility`. `GET /api/plans`, `GET /api/plans/:id`,
generation results, and recommendations expose this viewer-specific state.
Anonymous responses, and any `cancelled` plan, are `view-only`.

The migration normalizes legacy `plan.status = selected` rows back to
`generated`; CU22 no longer uses that lifecycle value as its source of truth.
CU23 can later query active intentions by `created_at` and address the
corresponding `id_user` with “¿Hiciste este plan?”.
