# Technical Decisions

This document records stable decisions. Record recent operational decisions
briefly in `TRACKING.md` as well.

| Decision | Status | Rationale |
| --- | --- | --- |
| PostgreSQL with TypeORM | Current | Relational persistence with local Docker support and migrations. |
| Backend-managed JWT | Current | Defined by technical feasibility work. |
| English source naming | Current | Consistent technical names across code, API, and database; academic Spanish terms remain only for historical traceability. |
| `class-validator` for environment and DTOs | Current | Avoids introducing two validation libraries. |
| Startup environment validation | Current | Fails early on incomplete configuration. |
| GitHub Issues for backlog and sprints | Current | Replaces previous Jira usage. |
| `DATABASE_URL` or individual PostgreSQL variables | Current | Railway provides `DATABASE_URL`; local Docker uses `DB_*`. |
| Isolated `_test` e2e database | Current | Prevents schema cleanup against development. |
| Production startup migrations | Current | No separate deployment step exists yet. |
| Google Maps: Places API (New), Routes API, and Geocoding API | Current | Replaces legacy Distance Matrix based on validated spike results. |
| Dedicated seed script, not migrations | Current | Seeds are rerunnable and idempotent; migrations run once. |
| Seeds do not overwrite or restore rows | Current | Administration owns catalog changes and soft deletion is deliberate. |
| Admin role has every permission | Current | Administrators also use normal application features. |
| Gemini for plan generation | Current | Replaces the originally planned OpenAI API. Implemented for automatic plan generation (worker) and the composer assistant; it only chooses among catalog activities and never invents prices or places. |
| RabbitMQ with API-owned native worker thread | Current | RabbitMQ, persistent publishing, TTL/DLX retries and DLQ stay unchanged. `node:worker_threads` runs the existing consumers and feedback scheduler automatically inside one API instance, without a second process/deployment. Startup and thread replacement fail interrupted domain jobs instead of resuming them; terminal messages are skipped on redelivery. |
| S3-compatible object storage for SmartPlan-owned images | Current | Galleries for activities, places, plans, ratings and feedback. Google photos are never copied into it. |
| `plan.visibility` gates the CU20 recommendation pool only | Superseded by #98 | The domain had no plan-visibility concept and `GET /api/plans` (CU12) already exposes every non-cancelled plan of every user. Rather than widen that, CU20 recommends only `visibility = 'public'` plans. A plan turns `public` when it is AI-generated (`id_plan_request` set) and reaches `completed`; manually created plans (CU24) stay `private`. Aligning CU12/CU13/CU43 with `visibility` (US13 "private plan → block access") is deferred to its own ticket. |
| Plans, generated results, and outings are kinds of `plan` (#98) | Current | One table (`plan.kind`: `authored`, `generated`, `outing`) keeps itinerary, totals, feedback, ratings, and the 24 h reminder working the same for all three, with no new tables. Choosing a plan copies it into an outing so later edits by the author never change it; a partial unique index keeps one outing to do per person and plan. Only authors publish (`visibility`), and it is enforced everywhere: exploration, detail, recommendations, favorites, and choosing. |
| Bounded synchronous Gemini for the manual composer's assistant (#131) | Current | Everything else that calls Gemini (plan generation) stays asynchronous in the RabbitMQ worker. The composer's assistant (`/users/me/plans/assistant/*`: natural-language search, suggestions, route review) needs an answer while the person is typing, so those three endpoints call Gemini inside the request, with the cheap intent model, JSON constrained by a schema, and a hard 7 s timeout. They are read-only and stateless, answer `503 ASSISTANT_UNAVAILABLE` on failure (the composer falls back to its regular search), and treat the model's output as untrusted: every id is resolved against the catalog, and distances, durations, costs, the 24 h limit and permutations are computed by the API, never by the model. |
| Price is a structured value; UNKNOWN is never `$0` | Current | `FREE`, `FIXED`, `FROM`, `RANGE`, `UNKNOWN` with unit, source and verification date. `FREE` needs positive evidence. A stored legacy `0` was ambiguous and becomes `UNKNOWN`. See `docs/catalog.md`. |
| Plan details snapshot the price shown at the time | Current | Editing an activity price never rewrites a saved plan; totals are computed from the snapshots as a range with a completeness flag. |
| Eligibility is separate from publication | Current | `discoverable`, `plan_eligible` and `auto_recommend_eligible` decide where an activity may appear; the threshold for automatic recommendation is `CATALOG_AUTO_RECOMMEND_MIN_PRICE_CONFIDENCE`. |
| Only the Google Place ID is persisted | Current | Coordinates and ratings from Google are a temporary cache (at most 30 days, never exported); photos are fetched live with attribution and their resource names are never stored. |
| OpenStreetMap/ODbL data is quarantined | Current | Imports of licence class `ODBL` are refused until a database-licence strategy is decided. |
| Catalog changes arrive as idempotent, hashed packages | Current | Staging and production keep separate databases; the same package file is verified, dry-run and imported in each. |

## Recording a Decision

Document a decision when it affects architecture, data model, HTTP contracts,
security, infrastructure, or shared conventions. Include context, the selected
alternative, and its rationale. Temporary operational decisions belong in
`TRACKING.md`.

### Catalog v1 decisions (Mendoza)

* **Google price data is place context, temporary.** `priceRange`/`priceLevel`
  are cached with the rating for at most 30 days, shown as a reference for the
  venue and never promoted to an activity price or exported.
* **Identified places publish.** A reviewed Google Place ID is enough to
  publish a place; its position comes from the temporary cache.
* **Price age is a dial, not a rule.** Staleness (90 days) is what people are
  told; how old a price automatic recommendation accepts is configured per
  environment (`CATALOG_AUTO_RECOMMEND_MAX_PRICE_AGE_DAYS`).
* **User evidence stays local.** Observed prices are per environment, never in
  version packages, never override current official/curated evidence, and keep
  the replaced price in history.
* **Catalog writes fail closed.** See `docs/catalog.md`.
