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
| `plan.visibility` gates the CU20 recommendation pool only | Current | The domain had no plan-visibility concept and `GET /api/plans` (CU12) already exposes every non-cancelled plan of every user. Rather than widen that, CU20 recommends only `visibility = 'public'` plans. A plan turns `public` when it is AI-generated (`id_plan_request` set) and reaches `completed`; manually created plans (CU24) stay `private`. Aligning CU12/CU13/CU43 with `visibility` (US13 "private plan → block access") is deferred to its own ticket. |

## Recording a Decision

Document a decision when it affects architecture, data model, HTTP contracts,
security, infrastructure, or shared conventions. Include context, the selected
alternative, and its rationale. Temporary operational decisions belong in
`TRACKING.md`.
