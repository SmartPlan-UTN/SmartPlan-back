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
| RabbitMQ worker | Asynchronous plan generation and integration jobs | Implemented as a separate process |
| Google Maps, Gemini, Amazon S3 | External services | Maps and Gemini used by generation; S3 pending |

The frontend communicates with the backend over HTTPS JSON. It never accesses
PostgreSQL, RabbitMQ, or Gemini directly. Controllers coordinate HTTP concerns;
business rules and SQL do not belong in controllers. Configuration uses
`ConfigService`, not direct `process.env` access.

## Messaging

`src/messaging/` provides a direct `smartplan.jobs` exchange, TTL/DLX retry
queues, a DLQ, and an independent worker process. Delivery is at-least-once, so
handlers must be idempotent. The API declares only its producer topology; the
worker declares queues and retry/DLQ topology.

Plan generation is not completed by the HTTP API process. Development requires
both `pnpm start:dev` and `pnpm start:worker:dev`; without the worker, accepted
requests remain `pending` and jobs accumulate in the generation queue. Provider
access failures are terminal and are persisted as
`GENERATION_PROVIDER_UNAVAILABLE`; transient provider failures continue through
the configured retry queues.

| Environment | Backend | Database |
| --- | --- | --- |
| Development | Local, `PORT` default 3001 | Docker or external PostgreSQL |
| Test | Jest/e2e execution | Isolated `<DB_NAME>_test` |
| Production | Railway planned | Managed PostgreSQL planned |
