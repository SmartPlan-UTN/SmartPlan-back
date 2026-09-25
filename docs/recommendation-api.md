# Recommendation contract (CU20 / US19 · CU21)

HTTP contract for the Home "Planes recomendados" section. Global `/api` prefix;
technical names in English, user-visible messages in Spanish.

## Endpoints

| Method   | Route                                     | Purpose                                       |
| -------- | ----------------------------------------- | -------------------------------------------- |
| `GET`    | `/api/plan-recommendations`               | Ranked plans to show the signed-in user       |
| `POST`   | `/api/plan-recommendations/:planId/dismiss` | Stop recommending this plan to the caller (CU21) |
| `DELETE` | `/api/plan-recommendations/:planId/dismiss` | Undo a dismissal — the "Deshacer" window (CU21) |

- **`GET` auth:** any authenticated user. No permission, no role.
- **`POST`/`DELETE` auth:** `recommendation.dismiss` permission (both user roles
  have it). Missing/invalid token → `401`.
- **`GET` success:** `200`. **`POST`/`DELETE` success:** `204`, no body. Both are
  idempotent (dismiss twice / undo twice / undo a plan that was never dismissed
  all return `204`).
- **`POST`/`DELETE` errors:** `404` `PLAN_NOT_FOUND` when the plan does not exist;
  `403` `CANNOT_DISMISS_OWN_PLAN` when the plan belongs to the caller.

### Plan request lifecycle failures

`POST /api/plan-requests` and `POST /api/plan-requests/surprise` return `202`
after persisting and publishing a request. The worker later moves it through
`pending` and `processing` to `generated` or `failed`. A request with
`failureCode = GENERATION_PROVIDER_UNAVAILABLE` means the configured Gemini
provider rejected the request (for example, invalid or denied project access);
it is not retried automatically. Network, timeout, rate-limit, and server
errors remain retryable according to the RabbitMQ policy.

### Query parameters

Extends `PaginatedQueryDto`.

| Parameter       | Type            | Rule                              | Default |
| --------------- | --------------- | --------------------------------- | ------- |
| `page`          | integer         | `>= 1`                            | `1`     |
| `limit`         | integer         | `1..100`                          | `20`    |
| `sortBy`        | string          | accepted, **ignored** (ranking is fixed) | — |
| `direction`     | `asc` \| `desc` | accepted, **ignored**             | `asc`   |
| `latitude`      | number ≤6 dp    | `-90..90`; needs `longitude` too  | —       |
| `longitude`     | number ≤6 dp    | `-180..180`; needs `latitude` too | —       |
| `maxDistanceKm` | number ≤2 dp    | `1..500`; only used with coordinates | user's `maxDistanceKm` preference, else `50` |

`ValidationPipe` rejects unknown parameters and out-of-range values with `400`.

### Response

```jsonc
{
  "data": [
    {
      // history | preferences | near_you | popular | within_budget | well_rated_by_you
      "reason": "history",
      "canSelect": false,           // always false — selecting is CU22
      "plan": {
        "id": 42,
        "title": "Tarde de vinos en Luján",
        "description": "…",
        "estimatedTotalCost": 8500,        // ARS, no currency field
        "estimatedTotalDuration": 300,     // minutes
        "activityCount": 3,
        "averageRating": 4.6,              // 0 when no approved ratings
        "distanceKm": 12.4,                // null without coordinates / no geocoded place
        "imageUrl": null,                  // no plan/activity image source yet
        "categories": [{ "id": 3, "name": "Gastronomía" }],
        "activityNames": ["Bodega", "Almuerzo", "Mirador"],
        "status": { "key": "completed", "name": "Completed" }
      }
    }
  ],
  "pagination": { "page": 1, "limit": 9, "total": 7, "totalPages": 1 },
  "meta": {
    "personalized": true,
    "locationUsed": true,
    "adjustedFromFeedback": true
  }
}
```

- `meta.personalized` — `true` when the caller has completed-plan history
  and/or saved category preferences that shaped the ranking.
- `meta.locationUsed` — `true` when `latitude`/`longitude` were supplied.
- `meta.adjustedFromFeedback` — `true` when the caller's post-experience
  feedback (CU23) actually moved the ranking (CU21). Never `true` without
  feedback; the client shows one honest line about it and nothing otherwise.
- No results → `200` with `data: []` and real `total`. Never an error, never a
  synthetic plan.

## Which plans are recommended

The pool is **other users' `public` plans** (`plan.visibility`, see
[decisions](decisions.md)). A plan becomes `public` when it is AI-generated
(`id_plan_request` set) and reaches `completed`. The caller's own plans, plans
with no activities, and plans the caller **dismissed** (CU21) are excluded.

## Ranking

A small, deterministic, additive heuristic — not a learned model. Weights live
in `src/plans/plan-recommendations.constants.ts`; the ranking is pure and unit
tested for invariants in `src/plans/plan-recommendations.ranking.spec.ts`.

Per candidate, in priority order:

1. **history** — Jaccard overlap between the plan's categories and the
   categories of the caller's completed plans.
2. **preferences** — overlap with the caller's saved category preferences
   (CU8/CU18).
3. **near_you** — proximity, only when coordinates are supplied; plans outside
   the radius are filtered out (plans with no geocoded place are kept, ranked
   last on this axis).
4. **popular** — average approved activity rating, normalised. This is also the
   sole signal, and the fallback, for a user with no history or preferences.

`reason` is the axis that contributed most to the winning score (ties resolve
`history > well_rated_by_you > preferences > within_budget > near_you >
popular`). Order: score desc → average rating desc → id asc. Same inputs, same
order.

### CU21 — feedback signals

The caller's own feedback on their own `completed` plans (CU23), status
`pending` or `processed` (never `discarded`/CU59), nudges the ranking. All of it
is conservative — feedback refines the order, it never dominates it. Weights and
thresholds live in `FEEDBACK_WEIGHTS`; the aggregation is
`src/plans/recommendation-feedback-profile.ts` (unit tested).

- **rating → category affinity.** Each shared history category counts as its
  affinity multiplier instead of a flat `1`. The multiplier is
  `1 + (n / (n + 3)) · (avgRating − 3) / 2`, clamped to `[0.6, 1.4]` — so one bad
  outing barely moves a category and it takes 3–5 consistent ratings to matter.
- **`too_expensive` + spend → `within_budget`.** When the user looks
  cost-sensitive (tags `too_expensive`, or real spend over estimate), a
  candidate whose expected real cost (`estimate · median(actual/estimate)`) fits
  the user's usual spend scores up; one that overshoots scores down. A negative
  budget term can lower a card but is never surfaced as its `reason`.
- **`far` → proximity weight.** Frequent `far` tags raise the distance weight
  (toward `0.75`) **within the permitted radius**. An explicit `maxDistanceKm`
  preference is never narrowed.
- **rating 4-5 / `great_value` / `would_recommend` → `well_rated_by_you`.**
  Categories the user endorsed after doing them get a reinforcement term.

With no feedback the profile is neutral and the ranking is exactly CU20.

## Errors

| Status | When |
| ------ | ---- |
| `400`  | invalid/out-of-range `page`/`limit`/`latitude`/`longitude`/`maxDistanceKm`, or any unknown query parameter |
| `401`  | missing, invalid, or expired token |
| `403`  | `CANNOT_DISMISS_OWN_PLAN` — dismissing a plan the caller owns |
| `404`  | `PLAN_NOT_FOUND` — dismissing/undoing a plan that does not exist |
| `500`  | unexpected database failure |
