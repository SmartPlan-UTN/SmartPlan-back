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

### Listing own plan requests (#136)

`GET /api/plan-requests` lists the caller's own searches so the client can
reopen their results ("Tus últimas búsquedas"). Any authenticated user; never
returns another user's requests. `Cache-Control: private, no-store`.

- **Listed:** `pending`, `processing`, and `generated` with at least one plan.
  `failed` (including expired) requests and generated ones whose plans are
  all gone have nothing to reopen and are not listed.
- **Query:** `PaginatedQueryDto` (`page`, `limit` 1..100, default 20);
  `sortBy` accepts only `requestedAt`; `direction` defaults to `desc`. Unknown
  parameters return `400`.
- **Order:** `requestedAt`, then `id`, in the requested direction.

```jsonc
{
  "data": [
    {
      "id": 42,
      "statusKey": "generated",       // pending | processing | generated
      "mode": "automatic",            // automatic | surprise
      "requestedAt": "2026-10-15T15:00:00.000Z",
      "query": "plan romántico con mi novia", // null for surprise
      "planCount": 4,                 // 0 while in flight
      "planTitles": ["Cena con vista", "Paseo y vino", "Teatro"] // up to 3, by plan id
    }
  ],
  "pagination": { "page": 1, "limit": 5, "total": 1, "totalPages": 1 }
}
```

The full results stay behind `GET /api/plan-requests/:id`.

### Plan request lifecycle failures

`POST /api/plan-requests` and `POST /api/plan-requests/surprise` return `202`
after persisting and publishing a request. The worker later moves it through
`pending` and `processing` to `generated` or `failed`. A request with
`failureCode = GENERATION_PROVIDER_UNAVAILABLE` means the configured Gemini
provider rejected the request (for example, invalid or denied project access);
it is not retried automatically. Network, timeout, rate-limit, and server
errors remain retryable according to the RabbitMQ policy, within the absolute generation deadline documented below.

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

The pool is **other people's published plans**: `kind = 'authored'`,
`visibility = 'public'`, and not cancelled (see [decisions](decisions.md) and
[Outings API](outings-api.md)). Only an author publishes a plan; generated
results and outings are never recommended. The caller's own plans, plans with
no activities, and plans the caller **dismissed** (CU21) are excluded.

## Ranking

A small, deterministic, additive heuristic — not a learned model. Weights live
in `src/plans/plan-recommendations.constants.ts`; the ranking is pure and unit
tested for invariants in `src/plans/plan-recommendations.ranking.spec.ts`.

Per candidate, in priority order:

1. **history** — Jaccard overlap between the plan's categories and the
   categories of the caller's completed outings.
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

## Generation deadline (CU17/CU19, #119)

Generation has one absolute **30 s** deadline from API reception, including
surprise location preparation, publication, queue wait and every retry. Successful
latency targets remain p50 ≤7 s and p95 ≤10 s; time to failure is not successful
generation latency. The 3–6 alternative policy and preference precedence remain.

The API expires pending/processing requests every second and on status reads,
independently of worker availability. Expiration is visible on the next sweep
(normally within one second of the deadline) or read. It requires a running API
and reachable database. `GET /api/plan-requests/:id` returns
`Cache-Control: private, no-store`.

Expired requests return `statusKey: failed`, `failureCode: GENERATION_TIMEOUT`
and `failedAt`. Preparation that times out before acceptance returns HTTP 503
with the same code. Provider/network retries are admitted only when their delay
fits the remaining deadline; they never reset it. Other queue job types retain
their existing policy. Provider calls receive cancellation; transactions check
the deadline and serialize finalization against expiration. Late workers cannot
overwrite a terminal status. Maps remains best effort, but no plan may finalize
after the overall deadline.

Optional routing waits at most 5 s and reserves the final 2 s of the remaining
budget for persistence. When that reserve is already reached, Maps is skipped.
Routes that finish within the routing budget are retained; unfinished calls are
cancelled and their plans are saved with null travel metrics. This reserve does
not extend the deadline or guarantee success when the database itself is slow.

No endpoints, database columns or migrations are added. The old worker recovery
sweep is retired; existing recovery columns remain for compatibility.

### Local measurement

Set `BENCHMARK_API_URL` to the local API base, `BENCHMARK_EMAIL` and
`BENCHMARK_PASSWORD` to a dedicated local account, and `BENCHMARK_LOGS` to the
comma-separated API and worker log paths. Keep secrets outside tracked files.
Run API and worker with the normal Nest console logger, capture both logs, and
use a distinct output file for each batch:

```sh
node scripts/measure-plan-generation.mjs before /tmp/generation-before.json
# Apply the change, rebuild, and restart both API and worker with fresh logs.
node scripts/measure-plan-generation.mjs after /tmp/generation-after.json
node scripts/report-plan-generation.mjs /tmp/generation-before.json /tmp/generation-after.json /tmp/generation-report.md
```

Each batch submits exactly five searches and five surprises, sequentially. The
script refuses to overwrite an existing batch, checkpoints submissions and never
retries a POST. An incomplete batch must be inspected rather than rerun: previous
requests may already have incurred provider usage. Unit/e2e tests simulate
providers and are not evidence for provider performance.

Events include `plan_request_prepared`, `plan_request_published`,
`plan_generation_attempt_started`, `plan_generation_attempt_failed`,
`plan_generation_stage_started/completed`, `gemini_call_completed/failed`,
`maps_routes_completed`, and `plan_generation_completed/failed`. Correlate by
`planRequestId`. Total duration includes retries; stage and token events include
each attempt. `queueWaitMs` is measured from the original job envelope creation,
so retry attempts include accumulated wait and processing, not just the latest
retry-queue residence.

### Generation latency budget (#119)

Generation prioritizes model composition whenever more than one candidate is
available, including surprise requests and locally interpreted text. A single
candidate needs no composition call. Local interpretation still avoids Gemini
when all text constraints are resolved; ambiguous text requires a successful
model interpretation, otherwise the request fails with
`GENERATION_PROVIDER_UNAVAILABLE` rather than losing exclusions or other intent.

Intent interpretation has a shared 7-second budget with at most one immediate
recovery attempt after a transient error or malformed response. Composition has
a shared 12-second budget with at most two attempts: a transient error or a batch
with no alternatives surviving the business validations can trigger recovery.
The second attempt receives only the remaining budget; a permanent provider
rejection or exhausted budget does not cause another call. Valid alternatives
are kept without retrying. These are ceilings, not delays added to fast calls.

Only after composition recovery is unavailable or unsuccessful does the local
fallback produce individual, constraint-checked activities. It no longer packs
unrelated experiences into a multi-stop itinerary. Optional routing waits at
most 1.5 seconds and retains completed routes. The 30-second global deadline,
2-second persistence reserve, preference defaults and terminal guards remain.

Structured `intent_model_retry`, `intent_resolution_failed`,
`composition_attempt_failed`, `composition_local_fallback` (reason and attempt
count) and `composition_strategy` events make model success, recovery and fallback
usage measurable. A routing duration rejection can also reduce an outing to
individual activities; that event is logged separately.

The 7–10-second objective requires staging measurements of both speed and
quality; shorter waits alone do not establish it. Report per-mode latency,
failures, model recovery and fallback rates against the
[baseline and pending after measurement](measurements/generation-performance.md).
Occasion relevance (#135) is covered in "Occasions and the Hogar" below.

## Occasions and the Hogar (#135, #210)

`context` accepts `atHome`, `freeOnly` and `occasions` (vocabulary keys,
added to the ones read from the text). The local interpreter reads
occasions ("con mi novia" → romantic, "con los nenes" → family + kids),
"en casa" and "gratis / sin gastar" (no longer a negation that forces the
model); Gemini returns the same fields and anything outside the vocabulary
is dropped. `resolvedContext` returns `occasions`, `atHome`, `freeOnly`
and `startingPoint`.

The location is a starting point, never a requirement: a department named
in the request or read from the text wins over the device position and the
preferred area ("estoy en Junín y quiero planes en el centro" plans in
Capital). `startingPoint` (`{ latitude, longitude }`) is the device
position or the preferred area only when it lies in the resolved
department, the same point the radius is measured from; otherwise it is
null. The Hogar sits there: the legs to and from home count as travel. With
no starting point the Hogar has no coordinates and its legs are zero. Every
Hogar stop goes last in the plan, whatever the model returned.

`homeMode` decides how the Hogar enters the plans:

| Condition | homeMode | Effect |
|---|---|---|
| `atHome` | only | every stop is at the Hogar |
| `freeOnly`, or a budget ≤ 6000 ARS per person | allowed | the Hogar competes; `freeOnly` keeps evidenced FREE prices only (UNKNOWN never passes) |
| otherwise, and surprise | filler | at most one Hogar stop per plan, three in the shortlist |

Candidates are filtered by who-occasions (all of them) and clashes, ranked
by matching occasions, and `isComposedPlanWithinLimits` re-checks every
rule after Gemini and in the fallback. With no candidate for the occasion
the request fails with `NO_VALID_COMBINATIONS` and
`failureDetail.reason = "no_candidates_for_occasion"`: the rule is never
relaxed in silence. Measurements: `docs/measurements/catalog-evaluation/`.
