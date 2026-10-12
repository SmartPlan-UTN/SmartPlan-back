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
| Gemini for plan generation | Current | Replaces the originally planned OpenAI API; product integration remains pending. |
| RabbitMQ worker process | Current | `@golevelup/nestjs-rabbitmq`, TTL/DLX retries, DLQ, and at-least-once delivery are implemented; functional jobs are pending. |
| Amazon S3 | Planned | Requires validation and implementation. |
| `plan.visibility` gates the CU20 recommendation pool only | Superseded by #98 | The domain had no plan-visibility concept and `GET /api/plans` (CU12) already exposes every non-cancelled plan of every user. Rather than widen that, CU20 recommends only `visibility = 'public'` plans. A plan turns `public` when it is AI-generated (`id_plan_request` set) and reaches `completed`; manually created plans (CU24) stay `private`. Aligning CU12/CU13/CU43 with `visibility` (US13 "private plan → block access") is deferred to its own ticket. |
| Plans, generated results, and outings are kinds of `plan` (#98) | Current | One table (`plan.kind`: `authored`, `generated`, `outing`) keeps itinerary, totals, feedback, ratings, and the 24 h reminder working the same for all three, with no new tables. Choosing a plan copies it into an outing so later edits by the author never change it; a partial unique index keeps one outing to do per person and plan. Only authors publish (`visibility`), and it is enforced everywhere: exploration, detail, recommendations, favorites, and choosing. |
| Bounded synchronous Gemini for the manual composer's assistant (#131) | Current | Everything else that calls Gemini (plan generation) stays asynchronous in the RabbitMQ worker. The composer's assistant (`/users/me/plans/assistant/*`: natural-language search, suggestions, route review) needs an answer while the person is typing, so those three endpoints call Gemini inside the request, with the cheap intent model, JSON constrained by a schema, and a hard 7 s timeout. They are read-only and stateless, answer `503 ASSISTANT_UNAVAILABLE` on failure (the composer falls back to its regular search), and treat the model's output as untrusted: every id is resolved against the catalog, and distances, durations, costs, the 24 h limit and permutations are computed by the API, never by the model. |
| Place reference photos straight from Google Places, never stored (#102) | Current | Uploaded images stay first; when a plan or activity has none, `imageUrl` points to `GET /api/activity-places/:id/photo` and `imageSource` is `google_maps`. Google's Terms let us keep only the place ID (*"You cannot cache a photo name"*, and names expire), so every request resolves a fresh name through Place Details (`photos` mask) and downloads it through Place Photos; the server keeps nothing and the browser caches the bytes for 1 h (`Cache-Control: private`). Each photo is two billed calls, so the route requires a session and is only reached when a client renders the image. Attribution travels in `X-Photo-Provider` and `X-Photo-Attributions` (exposed through CORS): clients must show "Google Maps" on every provider photo and the author links where the full image is shown. A missing link, a place without photos or an expired name is a `404 PLACE_PHOTO_NOT_FOUND`; quota, outage and provider errors map to 429/503/502 like the place lookup. |

## Recording a Decision

Document a decision when it affects architecture, data model, HTTP contracts,
security, infrastructure, or shared conventions. Include context, the selected
alternative, and its rationale. Temporary operational decisions belong in
`TRACKING.md`.
