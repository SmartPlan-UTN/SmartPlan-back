# Architecture

## Implementation Status

The backend includes NestJS configuration, environment validation, PostgreSQL
with TypeORM, migrations, unit/e2e tests, RabbitMQ messaging infrastructure,
and the CU17-CU23 plan-request generation and recommendation jobs.

| Component | Responsibility | Status |
| --- | --- | --- |
| Frontend | Web UI and API client | Separate repository |
| Backend | REST API, authentication, authorization | Foundations implemented |
| PostgreSQL / TypeORM | Relational persistence | Local integration and migrations |
| API-owned native worker thread | RabbitMQ consumers, plan generation, external sync and feedback reminders | Started automatically with the API |
| Google Maps, Gemini, Amazon S3 | External services | Maps and Gemini used by generation (queued) and by the composer's bounded assistant (synchronous, read-only); S3 pending |

The frontend communicates with the backend over HTTPS JSON. It never accesses
PostgreSQL, RabbitMQ, or Gemini directly. Controllers coordinate HTTP concerns;
business rules and SQL do not belong in controllers. Configuration uses
`ConfigService`, not direct `process.env` access.

## Messaging

`src/messaging/` provides a direct `smartplan.jobs` exchange, TTL/DLX retry
queues, a DLQ, and an API-owned native Node.js worker thread. Delivery is at-least-once, so
handlers must be idempotent. The API declares only its producer topology; the
worker declares queues and retry/DLQ topology.

Plan generation runs outside the main HTTP thread, but inside the same Node.js
process, through `node:worker_threads`. `pnpm start:dev` starts both HTTP and
the existing worker module; there is no separate worker service or command.
`RABBITMQ_PREFETCH` continues to bound consumption. The worker alone owns its
feedback scheduler, so reminders are not scheduled twice. Provider
access failures are terminal and are persisted as
`GENERATION_PROVIDER_UNAVAILABLE`; transient provider failures continue through
the configured retry queues.

This lifecycle supports exactly one API instance. Startup and thread replacement
mark outstanding plan requests and external sync runs failed before consumption
starts. Redelivered terminal messages are skipped, not replayed. Normal job-level
retries and the DLQ remain unchanged. API startup waits for thread readiness;
publishing is rejected during a thread outage and replacement uses bounded
backoff. Shutdown terminates the thread; outstanding rows are finalized on the
next startup. The main thread still expires generation at the original 30-second
deadline and terminal-state guards reject late results.

`src/messaging/native-worker/` manages the lifecycle and passes validated
database, RabbitMQ and provider configuration through `workerData`.
`src/worker.ts` is a thread-only entry point. Each thread owns an isolated NestJS
context and database pool; only the API manages schema changes. Threads do not
inherit JWT, email or storage credentials. No entity/schema migration is needed.

| Environment | Backend | Database |
| --- | --- | --- |
| Development | Local, `PORT` default 3001 | Docker or external PostgreSQL |
| Test | Jest/e2e execution | Isolated `<DB_NAME>_test` |
| Production | Railway planned | Managed PostgreSQL planned |
