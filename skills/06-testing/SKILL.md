---
name: smartplan-testing
description: How the backend is tested: unit versus e2e tests, the isolated test database, dependency mocking, and what a use case requires before it is considered complete. Read before writing the first test for a use case.
---

# SmartPlan Back - Testing

Specific to `SmartPlan-back`.

## The Two Test Types

| | Unit | E2E |
| --- | --- | --- |
| File | `<something>.spec.ts`, next to the code | `<module>.e2e-spec.ts`, in `test/` |
| Command | `pnpm test` | `pnpm test:e2e` |
| Tests | An isolated class | The entire app over HTTP |
| Dependencies | Mocked | Real |
| Database | **No** | Yes, `smartplan_test` |
| Duration | Milliseconds | Seconds |

File names determine the type: `pnpm test` picks up `.spec.ts`, while `pnpm test:e2e` picks up `.e2e-spec.ts`. Nothing needs to be registered.

**A unit test never touches the database.** If a test needs the database running, it is either an e2e test or the service should receive an injected repository rather than constructing one internally.

## Commands

```bash
pnpm test               # unit tests
pnpm test:watch         # unit tests in watch mode while writing
pnpm test:cov           # unit tests with coverage -> coverage/
pnpm db:up              # start PostgreSQL (e2e tests need it)
pnpm test:e2e           # e2e tests
```

A single test:

```bash
pnpm test plans.service           # by file name
pnpm test -t "rejects a plan"     # by test name
```

### What Runs in CI

The `CI` workflow in `.github/workflows/ci.yml` runs `pnpm lint`, `pnpm test`, and `pnpm build` on every PR without infrastructure. The three spikes are `skipped` because it does not set `RUN_GEMINI_SPIKE`, `RUN_GOOGLE_MAPS_SPIKE`, or `RUN_RABBITMQ_SPIKE`. `pnpm test:e2e` does not run in CI; run it manually before a PR containing integrated changes.

## Templates

These three files are ready to copy and paste. They are deliberately over-commented: they are reference material, not production code.

| Template | File | Demonstrates |
| --- | --- | --- |
| Service | [`src/app.service.spec.ts`](../../src/app.service.spec.ts) | Unit-test structure |
| Controller | [`src/app.controller.spec.ts`](../../src/app.controller.spec.ts) | Dependency mocking |
| Endpoint | [`test/app.e2e-spec.ts`](../../test/app.e2e-spec.ts) | Calling the app over HTTP |

## Mocking a TypeORM Repository

The most common case is a service that injects `Repository<Entity>` and needs replacing in a unit test. `getRepositoryToken()` provides its injection token.

```ts
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from './entities/plan.entity';
import { PlansService } from './plans.service';

describe('PlansService', () => {
  let service: PlansService;
  // The real repository type catches signature changes. Pick requires only
  // methods the service actually uses.
  let repository: jest.Mocked<Pick<Repository<Plan>, 'findOne' | 'save'>>;

  beforeEach(async () => {
    repository = { findOne: jest.fn(), save: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlansService,
        { provide: getRepositoryToken(Plan), useValue: repository },
      ],
    }).compile();
    service = module.get(PlansService);
  });

  describe('find', () => {
    it('returns the plan when it exists (CU13)', async () => {
      const plan = { id: 1, name: 'Afternoon at the park' } as Plan;
      repository.findOne.mockResolvedValue(plan);
      await expect(service.find(1)).resolves.toEqual(plan);
    });

    it('throws NotFoundException when it does not exist (CU13)', async () => {
      repository.findOne.mockResolvedValue(null);
      // The error path is half the test: it defines the HTTP status code the
      // frontend sees and is where code breaks most often.
      await expect(service.find(99)).rejects.toThrow(NotFoundException);
    });
  });
});
```

`clearMocks: true` is enabled in Jest, so mocks are cleared automatically between tests. Do not add `jest.clearAllMocks()` in an `afterEach`.

To replace a dependency **within an e2e test**, such as Google Maps or Gemini, use the `createTestApp` parameter:

```ts
const app = await createTestApp((module) =>
  module.overrideProvider(GoogleMapsService).useValue(fakeMap),
);
```

## The Isolated Test Database

E2e tests start the complete `AppModule`, opening a real PostgreSQL connection with `synchronize: true`; TypeORM rewrites the schema to match entities. Running this against the development database would lose data.

E2e tests therefore use **another database on the same server**:

```
smartplan        development - your data
smartplan_test   tests       - emptied on every run
```

| Step | File | What it does |
| --- | --- | --- |
| 1 | `test/test-database.ts` | Computes `<DB_NAME>_test` and rewrites `DB_NAME` and the database in `DATABASE_URL` |
| 2 | `test/prepare-database.ts` | `globalSetup`: creates the database if needed and leaves an empty schema |
| 3 | `test/test-environment.ts` | `setupFiles`: loads `.env`, fills placeholder keys, and applies step 1 in every suite |

**Nothing needs manual preparation.** With PostgreSQL running through `pnpm db:up`, `pnpm test:e2e` creates `smartplan_test` on its first run.

### The Safety Net

`requireTestSuffix` stops the run if the database name does not end in `_test`:

```
The test database is "smartplan", which does not end in "_test".
Tests drop and recreate the schema, so they only run against a test database.
```

This is deliberately an exception rather than a warning: a test that does not run is preferable to `DROP SCHEMA` against the wrong database. Check `DB_NAME_TEST` in `.env` if it occurs.

### Test Data

The schema is emptied **once per run**, not between tests. If tests in a suite interfere, clear affected tables in `beforeEach`:

```ts
const plans = app.get<Repository<Plan>>(getRepositoryToken(Plan));

beforeEach(async () => {
  await plans.delete({});
});
```

E2e tests use `maxWorkers: 1`, one at a time rather than in parallel, because they share this database. Do not remove it.

## Jest Configuration

Separate configurations exist because the test types need different settings:

| | Unit tests | E2E |
| --- | --- | --- |
| Location | `jest` in `package.json` | `test/jest-e2e.json` |
| Includes | `src/**/*.spec.ts` and `test/**/*.spec.ts` | `test/**/*.e2e-spec.ts` |
| `globalSetup` | — | `prepare-database.ts` |
| `setupFiles` | `reflect-metadata` | + `test-environment.ts` |
| `maxWorkers` | Default (parallel) | `1` |
| `testTimeout` | 5 s | 30 s |

Coverage from `pnpm test:cov` excludes `main.ts`, `*.module.ts`, `data-source.ts`, and migrations. They are wiring without business logic, and e2e tests exercise them.

## Expectations for a Use Case

From `AGENTS.md` and `TRACKING.md`:

> A use case is not complete without at least one happy-path test.

For a use case with an endpoint:

- [ ] A service unit test covering the happy path **and** the applicable error (`NotFoundException`, `ForbiddenException`, ...).
- [ ] An endpoint e2e test covering the HTTP status code and response shape.
- [ ] If the endpoint receives a DTO, an e2e test that sends an invalid body and expects `400`.
- [ ] A behavior-based test name, not a method name: `'rejects a plan without activities'`, not `'test create'`. Reference the use case in parentheses.

**Before opening the PR:** `pnpm lint`, `pnpm test`, and `pnpm test:e2e`.

## Common Errors

| Symptom | Cause |
| --- | --- |
| `Could not prepare the test database` | PostgreSQL is not running -> `pnpm db:up` |
| `The test database is "..." and does not end in "_test"` | `DB_NAME_TEST` is incorrectly configured in `.env` |
| `A worker process has failed to exit gracefully` | Missing `await app.close()` in the e2e test's `afterAll` |
| `Cannot find module 'src/...'` in an e2e test | Use a relative import (`../src/...`), not an alias |
| A test passes alone and fails with others | Shared database state; clear tables in `beforeEach` |
| `ECONNREFUSED ... 5672` in an e2e test | RabbitMQ is not running -> `pnpm db:up`. Since F12, `AppModule` opens AMQP on startup; the `'producer'` role declares only the main exchange, not queues, but still requires a connection. |
| `PRECONDITION_FAILED ... x-message-ttl` when running the RabbitMQ spike or worker | Retry queues have a different TTL because `RABBITMQ_RETRY_DELAYS_MS` changed or the spike's short TTL remains. Delete `smartplan.jobs.example.retry.*` queues in the management UI at http://localhost:15672 and restart. |
