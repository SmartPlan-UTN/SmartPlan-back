# Testing

## Test Types

| Type | Location | Command | Dependencies |
| --- | --- | --- | --- |
| Unit | Next to source code, `*.spec.ts` | `pnpm test` | Mocked; no database |
| E2E | `test/*.e2e-spec.ts` | `pnpm test:e2e` | Real application and PostgreSQL |

## Isolated Database

E2E tests use a database separate from development, `smartplan_test` by default.
Test setup creates it when needed and clears its schema before running and before each suite. Each suite owns its fixtures. Schema resets require a local host. Its name
must end in `_test`; this safety boundary prevents a test `DROP SCHEMA` from
running against the development or production database.

Before running e2e tests:

```bash
pnpm db:up
pnpm test:e2e
```

E2E suites run serially because they share the database. A suite requiring
additional isolation must clean its own tables in `beforeEach`.

## Use-Case Expectations

- Service unit test: happy path and a relevant error.
- Endpoint e2e test: HTTP status and response shape.
- Invalid DTO e2e test: a `400` response when applicable.
- Behavior-focused test name that includes the CU.

Existing patterns and TypeORM repository mocks are in the
[testing skill](../skills/06-testing/SKILL.md).

## Native Worker Tests

API-only suites override `NativeWorkerService` so they do not accidentally start
consumers. The generation pipeline suites enable the real API-owned thread
lifecycle and use native thread fixtures with simulated provider responses;
RabbitMQ and PostgreSQL remain real. They do not spawn a child process.
Use a dedicated RabbitMQ vhost for tests and stop the development API before
running these suites, so a production/development consumer cannot take test jobs.

Unit tests cover readiness, startup timeout, thread crashes/replacement, cleanup
failure, shutdown, publishing during an outage, and terminal sync redelivery.
