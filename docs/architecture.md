# Architecture

## Implementation Status

The backend includes NestJS configuration, environment validation, PostgreSQL
with TypeORM, migrations, unit/e2e tests, RabbitMQ messaging infrastructure,
and functional background jobs remain unimplemented.

| Component | Responsibility | Status |
| --- | --- | --- |
| Frontend | Web UI and API client | Separate repository |
| Backend | REST API, authentication, authorization | Foundations implemented |
| PostgreSQL / TypeORM | Relational persistence | Local integration and migrations |
| RabbitMQ worker | Asynchronous jobs | Infrastructure and example job only |
| Google Maps, Gemini, Amazon S3 | External services | Product integrations pending |

The frontend communicates with the backend over HTTPS JSON. It never accesses
PostgreSQL, RabbitMQ, or Gemini directly. Controllers coordinate HTTP concerns;
business rules and SQL do not belong in controllers. Configuration uses
`ConfigService`, not direct `process.env` access.

## Messaging

`src/messaging/` provides a direct `smartplan.jobs` exchange, TTL/DLX retry
queues, a DLQ, and an independent worker process. Delivery is at-least-once, so
handlers must be idempotent. The API declares only its producer topology; the
worker declares queues and retry/DLQ topology.

| Environment | Backend | Database |
| --- | --- | --- |
| Development | Local, `PORT` default 3001 | Docker or external PostgreSQL |
| Test | Jest/e2e execution | Isolated `<DB_NAME>_test` |
| Production | Railway planned | Managed PostgreSQL planned |
