# Recommendation contract (CU20 / US19)

HTTP contract for the Home "Planes recomendados" section. Global `/api` prefix;
technical names in English, user-visible messages in Spanish.

## Endpoint

| Method | Route                       | Purpose                                  |
| ------ | --------------------------- | ---------------------------------------- |
| `GET`  | `/api/plan-recommendations` | Ranked plans to show the signed-in user  |

- **Auth:** any authenticated user. No permission, no role. Missing/invalid
  token → `401`.
- **Success:** `200`.

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
      "reason": "history",          // history | preferences | near_you | popular
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
  "meta": { "personalized": true, "locationUsed": true }
}
```

- `meta.personalized` — `true` when the caller has completed-plan history
  and/or saved category preferences that shaped the ranking.
- `meta.locationUsed` — `true` when `latitude`/`longitude` were supplied.
- No results → `200` with `data: []` and real `total`. Never an error, never a
  synthetic plan.

## Which plans are recommended

The pool is **other users' `public` plans** (`plan.visibility`, see
[decisions](decisions.md)). A plan becomes `public` when it is AI-generated
(`id_plan_request` set) and reaches `completed`. The caller's own plans and
plans with no activities are excluded.

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
`history > preferences > near_you > popular`). Order: score desc → average
rating desc → id asc. Same inputs, same order.

Feedback tags (`too_expensive`, `far`, …) are **not** part of the score in this
version; evolving the ranking from feedback is CU21's scope.

## Errors

| Status | When |
| ------ | ---- |
| `400`  | invalid/out-of-range `page`/`limit`/`latitude`/`longitude`/`maxDistanceKm`, or any unknown query parameter |
| `401`  | missing, invalid, or expired token |
| `500`  | unexpected database failure |
