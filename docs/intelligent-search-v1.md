# Intelligent Search v1 — local implementation

Branch: `feature/intelligent-search-v1` in both repositories. No push, merge or deployment is part of this work.

## What the local product does

The deterministic engine understands an outing intent, retrieves published Places and actual offerings, checks feasibility before ranking, solves a timed itinerary and persists differentiated proposals. Restaurants, cafés and bars no longer require synthetic Activity rows to participate. Agencies are not visits; wineries and adventure providers need actual offerings.

Explicit budget, party, date and travel wording take precedence over profile habits. The local vocabulary handles the romantic-surprise example without asking Gemini to invent a location. The worker receives the same engine and verification flags as the API. Optional extras require a measurable connection to their anchor; a department-centre placeholder cannot establish that two venues are nearby. Starts use quarter-hour meeting times and include the transfer allowance. Known closing during a visit rejects the stop.

Plans and outings carry a unified stop view, including Place-backed stops, timeline, price snapshot, evidence and caveats. Results show the interpretation and actual retrieval counts. Caveats are expandable with the keyboard. A partial total consisting of free stops plus unknown paid stops does not display `$0` as its price. Explicitly unsupported experiences remain visible in both the request and saved plan explanations.

## Product truth in evaluation

`pnpm eval:plans --out <directory>` reads the selected database and runs offline. Verify the local target before running it. It does not migrate or synchronise the schema.

The report separates structural regressions from product satisfaction:

- `FULL`: every explicit experience is present and operational constraints have sufficient evidence.
- `PARTIAL`: an explicit experience is missing, including cinema without screenings.
- `UNCERTAIN`: semantic coverage exists but hours, position or the budget remain unconfirmed.
- `FAILED`: an operational/structural violation, or no proposal.

Each proposal reports missing experiences and `verifiedBudgetFit` separately. A known lower bound, an unknown dinner price or a partial total cannot establish a verified budget fit. The local catalog currently yields **13 UNCERTAIN and 1 PARTIAL**, despite passing the 14 structural scenario checks. This is a data-coverage result, not proof of fourteen fully executable plans. The current trace is in [the evaluation report](measurements/planning-eval/2026-10-16-verified/summary.md).

## Menu observations and meal baskets

`place_menu_observation` stores append-only factual observations for a reviewed Place: official source URL, observed date, source modification date when available, expiration, content hash and explicit item prices/portions/meal moments. The additive migration is `1792000000001-AddPlaceMenuObservation.ts`; the preceding planning migration is also required.

The first adapter reads an official JSON-LD capture following [Schema.org MenuItem](https://schema.org/MenuItem) and [MenuSection](https://schema.org/MenuSection). It only accepts explicitly priced ARS offers in curator-mapped sections. Unknown currency, unavailable items, ambiguous formatted amounts, unreviewed retention and stale source dates cannot produce a priced meal. Download time never refreshes an old source modification date. These are factual observations, not copied menu documents or provider caches.

Preview a reviewed capture without opening a database connection:

```powershell
pnpm catalog:menu source.json menu-jsonld.json
```

Import after reviewing the preview and verifying `.env.local` targets a local database:

```powershell
pnpm catalog:menu source.json menu-jsonld.json --confirm <exact-local-database-name>
```

Example source registry entry (replace the fixture identity and URL with the reviewed source):

```json
{
  "placeId": 1,
  "sourceUrl": "https://restaurant.example/menu",
  "retention": "OWNED",
  "currentAsOf": "2026-10-16T12:00:00Z",
  "refreshDays": 14,
  "sections": {
    "Principales": { "role": "main", "serves": 1, "moments": ["dinner"] },
    "Bebidas": { "role": "drink", "serves": 1, "moments": ["dinner"] },
    "Entradas": { "role": "starter", "serves": 1, "moments": ["dinner"] },
    "Postres": { "role": "dessert", "serves": 1, "moments": ["dinner"] }
  }
}
```

The curator must verify the source identity, current menu, retention basis, portions and meal moments. `OWNED` means SmartPlan's own reviewed factual records, not ownership of the restaurant website. Retain only permitted observations. The importer does not fetch arbitrary URLs, publish a catalog or invoke a paid provider.

For a group, LIGHT uses mains and drinks; STANDARD adds a shared starter per two people; FULL also adds desserts. The bounds come from the eligible items and explicit portions. The result is an example consumption range with its components and source, excluding extras/tips; it is not an exact venue-wide spending promise. Missing recipe components leave the estimate unknown. The latest expired observation cannot reactivate an older menu. No production menu observations were fabricated or bulk-imported to make evaluation green.

The integration fixture demonstrates a standard meal for two at ARS 54,000, correct whole-group price persistence, selection into an outing, cinema omission disclosure and expiry invalidation. Fixture restaurants and prices exist only in the disposable test database.

When a required experience is unavailable, only the supported required portions are offered, with the missing portion disclosed. Optional filler cannot replace the missing experience; a cinema-only request returns no valid combinations rather than an unrelated dinner. Plan and outing details retain the same saved uncertainty explanations.

## Local QA and boundaries

The isolated review uses frontend `127.0.0.1:3012`, API port `3013`, local database `smartplan_planning` and broker vhost `smartplan-qa-v1-20261016`. Existing servers on 3000/3001 and the earlier 3010/3011 processes were preserved. A separate `_test` database and broker vhost are used for integration tests. Test suites reset their own local test schema so failed teardown cannot contaminate subsequent suites. Registration/login audit rows are removed before fixture users; production audit constraints remain intact.

The first browser probe discovered that the older 3010 build still pointed to 3001 and displayed the previous pipeline. It was excluded as evidence for this implementation. Subsequent current-engine API/worker QA uses dummy provider keys and disables backend provider calls. The browser map uses the existing frontend Maps configuration; no claim about Cloud billing or paid-provider/live verification performance is made.

`PLANNING_ENGINE_ENABLED=true` is the default. `PLANNING_LIVE_VERIFICATION_ENABLED=false` is the default and must remain opt-in after provider terms and shared quota review. OSM remains discovery-only. Live provider coordinates are not promoted to canonical Place data. No remote database, Railway migration or deployment was used for this review.

## Remaining wider-ticket work

This is not a declaration that the entire decision-engine roadmap is finished. Local acquisition/refresh/revalidation, one cinema's dated inventory, per-stop feedback learning, refinement controls and shared manual-creator checks now have implementation and focused evidence. Broad reviewed menu/hour/context coverage, additional cinema/events/adventure inventory and fresh rendered acceptance remain incomplete. The manual editor now authors and reopens both Activity and Place Action targets. The 19 October increment and remaining acceptance gaps are recorded in [the product evidence report](intelligent-search-excellence-2026-10-19.md). Current measurements, the provisional 16-dimension scorecard and execution restrictions are recorded in [the 17 October continuation report](measurements/intelligent-search/2026-10-17-resume/report.md).

## Plan Readiness

`readiness` accompanies every plan detail and outing detail (`GET /plans/:id`, `GET /users/me/outings/:id`). It is derived from the planner's saved snapshot plus one persisted fact, `plan_detail.preparation_confirmed_at` (migration `1792000000006`):

| Stage | Meaning |
| --- | --- |
| `SUGGESTED` | A proposal exists but its stops have no timeline to check. |
| `FEASIBLE` | Every stop is placed in time, but hours or prices remain unconfirmed. |
| `VERIFIED` | Every stop has known hours and price evidence. |
| `PREPARATION_REQUIRED` | Verified, but a required ticket is still unconfirmed. |
| `READY` | Verified and no required task pending. |

Tasks: a screening requires a `TICKET` (official booking link, otherwise the cinema's schedule); a meal with an official reservation URL or six or more people suggests a `RESERVATION` (recommended, never blocking). An available link never confirms anything: only `PATCH /users/me/outings/:id/details/:detailId/preparation` `{ confirmed }` does, it is self-reported, and a stop with nothing to prepare answers `409 NO_PREPARATION_TASK`. SmartPlan never buys or books. Manual plans without planner evidence never reach `VERIFIED`.
