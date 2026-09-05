# Testing

## Test Types

| Type | Location | Command | Dependencies |
| --- | --- | --- | --- |
| Unit | Next to source code, `*.spec.ts` | `pnpm test` | Mocked; no database |
| E2E | `test/*.e2e-spec.ts` | `pnpm test:e2e` | Real application and PostgreSQL |

## Isolated Database

E2E tests use a database separate from development, `smartplan_test` by default.
Test setup creates it when needed and clears its schema before running. Its name
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
