---
name: smartplan-backend
description: NestJS backend conventions: module structure, TypeORM, JWT, validation, and error handling. Read before writing any controller, service, or entity.
---

# SmartPlan Back - Conventions

Specific to `SmartPlan-back`.

## Stack

| Component  | Version | Note                                      |
| ---------- | ------- | ----------------------------------------- |
| NestJS     | 11.x    |                                           |
| TypeScript | 5.7.x   |                                           |
| TypeORM    | 0.3.x   | through `@nestjs/typeorm`                 |
| PostgreSQL | -       | `pg` driver                               |
| Jest       | 30.x    | unit (`*.spec.ts`) and e2e (`test/`) tests |
| ESLint     | 9.x     | with integrated Prettier                  |
| Prettier   | 3.x     |                                           |

Package manager: **pnpm**.

## Commands

```bash
pnpm install           # install dependencies
pnpm start:dev         # development server with watch mode
pnpm start:worker:dev  # worker with watch mode (F12; requires RabbitMQ running)
pnpm build             # compile
pnpm lint              # static analysis (check only)
pnpm lint:fix          # static analysis with automatic fixes
pnpm format            # format with Prettier
pnpm test              # unit tests
pnpm test:e2e          # end-to-end tests
pnpm test:cov          # coverage
pnpm db:seed           # seed roles, permissions, statuses, and categories
```

## Structure

The repository began as a scaffold (`app.controller.ts`, `app.service.ts`,
`app.module.ts`, `main.ts`). As it grows, the expected NestJS organization is
**one module per system module**:

```
src/
├── main.ts                 API (HTTP) bootstrap
├── worker.ts               worker bootstrap (F12), separate process without HTTP
├── app.module.ts
├── config/                 configuration and environment variables
├── database/               PostgreSQL connection, CLI DataSource, migrations
├── common/                 guards, interceptors, pipes, filters, decorators
├── messaging/              F12: message queues, publisher, and worker
├── auth/                   CU1-CU4: login, registration, recovery, logout
├── users/                  CU5-CU8, CU57, CU61, CU62
├── activities/             CU9-CU11, CU14, CU53
├── places/                 place catalog
├── categories/             CU54
├── plans/                  CU12, CU13, CU24-CU31, CU60
├── recommendation/         CU17-CU23
├── collections/            CU32-CU38
├── favorites/              CU15, CU39-CU43
├── ratings/                CU44-CU47, CU55
├── external-integration/   CU48-CU52 (Google Maps)
└── administration/         CU56, CU58, CU59
```

Each module follows the standard NestJS structure:

```
plans/
├── plans.module.ts
├── plans.controller.ts
├── plans.service.ts
├── dto/
│   ├── create-plan.dto.ts
│   └── update-plan.dto.ts
└── entities/
    ├── plan.entity.ts
    └── plan-detail.entity.ts
```

## Names

Domain names are **in English** (see `skills/01-domain/`).

| Item                | Convention             | Example                  |
| ------------------- | ---------------------- | ------------------------ |
| PostgreSQL table    | `snake_case`, singular | `plan_detail`            |
| Entity class        | `PascalCase`           | `PlanDetail`             |
| File                | `kebab-case` + suffix  | `plan-detail.entity.ts`  |
| API route           | `kebab-case`, plural   | `/api/plan-details`      |
| Column              | `snake_case`           | `estimated_cost`         |

Declare table names explicitly so they match the traceability matrix in the
documentation:

```ts
@Entity('plan_detail')
export class PlanDetail { ... }
```

Do not use Spanish entity names. The CU -> entity -> code traceability chain is
a delivery requirement.

## Entities

The 37 original model entities and CU51's `ExternalDataUsage` trace entity are in
`src/<module>/entities/`. The class diagram (Appendix No. 5) defines the original
model; the complete original list is in `skills/01-domain/`.

When writing a new entity or changing an existing one:

- **Extend `BaseEntity`** (`src/common/entities/base-entity.ts`): it provides
  `id`, `created_at`, `updated_at`, and `deleted_at`. Never redeclare them.
- **For a catalog table** (`*_status`, `*_type`, `role`, `permission`), extend
  `CatalogEntity`: it adds `name`, unique `key`, and `description`. Compare by
  `key` in code, never by `name` or `id`.
- **Deletion is soft.** `@DeleteDateColumn` manages `deleted_at`: use
  `repository.softRemove()`, not `delete()`. Queries omit deleted rows by
  default.
- **A unique index on reusable data excludes deleted rows:** add
  `where: '"deleted_at" IS NULL'`. Without it, removing and re-adding a favorite
  or preference fails because the deleted row retains its keys. Session and
  recovery hashes are not reused and remain unique across the full history.
- **Critical invariants also belong in PostgreSQL through `@Check`.** DTOs
  protect the API; constraints protect the database from migrations, scripts,
  and other writers. Ratings, amounts, durations, ordering, and coordinates
  must not be outside their valid ranges.
- **Foreign keys are named `id_<entity>`** and declared twice: the column
  (`@Column({ name: 'id_user' })`) and the relationship (`@ManyToOne` +
  `@JoinColumn`). Keeping the standalone column avoids a `JOIN` when only the
  id is needed.
- **Every foreign key is indexed.** PostgreSQL does not index them automatically.
  If the column is already first in a composite index, that is sufficient.
- **Amounts use `numeric` with `decimalTransformer`**
  (`src/common/typeorm/decimal-transformer.ts`). Without the transformer, the
  `pg` driver returns strings and sums concatenate; with `float`, equivalent
  calculations can produce different results.
- **Define `onDelete`** on every relationship: `CASCADE` when the child makes
  no sense without its parent (a `plan_detail` without a plan), `RESTRICT` for
  catalogs, and `SET NULL` when the reference is optional.

`src/database/entities.spec.ts` checks all of this without requiring a database:
table names against the diagram list, `snake_case` columns, primary keys, soft
deletion, partial unique indexes, structural relationships, domain constraints,
and unindexed foreign keys. Run it with `pnpm test` after changing an entity.

## API Rules

- Global prefix: `/api`.
- Standard REST verbs: `GET` to list or retrieve, `POST` to create, `PATCH` to
  update, and `DELETE` to delete.
- Routes use **English, plural, `kebab-case` nouns**: `/api/plans`,
  `/api/plan-details`. Do not use verbs (`/create-plan`), Spanish (`/usuarios`),
  or singular forms (`/activity`). Child resources follow the same rule:
  `/api/plans/:id/plan-details`.
- Names in a public URL do not necessarily match the table name: tables are
  singular `snake_case`; routes are plural `kebab-case`.
- **Use `class-validator` DTOs for every input.** Never read raw `req.body`.
- Use a global `ValidationPipe` with `whitelist: true` and
  `forbidNonWhitelisted: true` to reject properties not declared in the DTO.
- Do not return TypeORM entities directly when they contain sensitive data
  (`user.password`, tokens). Use a response DTO or `@Exclude()`.

## OpenAPI Documentation

Swagger UI is served at `/api/docs`; its machine-readable OpenAPI contract is
at `/api/docs-json`. It is part of the API contract, not an optional aid.

- Every controller uses `@ApiController({ tag, authenticated })` from
  `src/common/swagger/api-controller.decorator.ts`, next to `@Controller`.
  It documents grouping, JWT Bearer security for protected routes, and the
  shared error format. Public controllers set `authenticated: false` or omit it.
- Every input remains a `class-validator` DTO. The Swagger CLI plugin derives
  body/query schemas and constraints from those classes. For a field it cannot
  infer (generic wrapper, union, custom response), add `@ApiProperty` or
  `@ApiPropertyOptional` from `@nestjs/swagger`.
- Add explicit endpoint decorators for exceptional behavior:
  `@ApiOperation`, `@ApiCreatedResponse`, `@ApiOkResponse`,
  `@ApiNoContentResponse`, `@ApiNotFoundResponse`, and `@ApiConflictResponse`.
  Success and error statuses shown in Swagger must match the implementation.
- Errors use `ErrorResponseDto`, which mirrors the global exception filter;
  never document passwords, access tokens, refresh tokens, hashes, or cookies
  as response fields.
- Before a PR, inspect `/api/docs-json` or the Swagger UI after starting the
  application and confirm each changed route, its inputs, security, and status
  responses are represented.

## Logging

- TypeORM uses `logging: false`: do not enable `query`, `error`, or
  `query-and-parameters` logging. SQL and bound parameters are noisy and can
  expose personal data, including when a database operation fails.
- Log structured event names and safe identifiers only. Never log passwords,
  access or refresh tokens, full request bodies, credentials, or external API
  payloads. Preserve the existing worker rule of logging job metadata, never
  complete job payloads.
- HTTP middleware assigns a request id and returns it in `X-Request-Id`; the
  global filter returns that same `requestId` in every error response. Use it to
  connect a frontend report with the safe server-side event. Never include an
  error stack, raw SQL, a query string, or request body in that response.
- HTTP events are `http_request_completed`, `http_request_rejected`, and
  `http_request_failed`. Their allowed fields are request id, method, route,
  status code, duration, API error code, and exception class; add no sensitive
  fields.

## Listings: Pagination and Sorting

Every `GET` returning a collection receives `PaginatedQueryDto` from
`src/common/pagination/paginated-query.dto.ts`. The public convention is:

| Query parameter | Type            | Default                  | Rule                                           |
| --------------- | --------------- | ------------------------ | ---------------------------------------------- |
| `page`          | integer         | `1`                      | Starts at 1                                    |
| `limit`         | integer         | `20`                     | Between 1 and 100                              |
| `sortBy`        | string          | endpoint-defined         | Only public fields allowed by that module      |
| `direction`     | `asc` \| `desc` | `asc`                    | Lowercase                                      |

Example: `GET /api/activities?page=2&limit=20&sortBy=name&direction=asc`.

Each module publishes allowed `sortBy` values in its DTO and explicitly maps
them to columns. **Never interpolate the parameter into SQL or pass it to
TypeORM without an allowlist.** When absent, the endpoint applies a documented
default order. Sorting always has a stable `id` tie-breaker; without it, a record
can move between pages when two values match.

```ts
export enum ActivitySortField {
  NAME = 'name',
  PRICE = 'price',
}

export class ListActivitiesDto extends PaginatedQueryDto {
  @IsEnum(ActivitySortField)
  @IsOptional()
  declare sortBy?: ActivitySortField;
}
```

Build responses with `createPaginatedResponse`; they always have this shape,
even when `data` is empty:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 0
  }
}
```

In TypeORM, `skip` is `(page - 1) * limit`, `take` is `limit`, and `total` comes
from `findAndCount` (or its QueryBuilder equivalent). Do not return page zero or
use offset as part of the HTTP contract.

## Authentication

JWT managed by the backend. The token is sent in `Authorization: Bearer <token>`.

- Passwords are stored **hashed** (bcrypt or argon2), never as plain text.
- Protected endpoints use a guard; public endpoints are explicitly marked with
  a decorator (`@Public()`).
- Role and permission authorization uses the `role`, `permission`, and
  `role_permission` entities.

## Configuration and Secrets

`ConfigModule` from `@nestjs/config` is registered as **global** in
`app.module.ts`: `ConfigService` can be injected into any module without
re-importing it.

The variable schema is in `src/config/environment-variables.ts`
(`EnvironmentVariables` and `validateEnvironment`) and is validated with
`class-validator` **at startup**. If a required key is absent or invalid, the
process does not start.

- Use environment variables for everything: database credentials, JWT secret,
  access and refresh JWT secrets, and Resend, Google Maps, and Gemini API keys.
- **Never commit `.env`.** `.env.example` contains keys and no values.
- Use `ConfigService`, not direct `process.env`, to read configuration:

  ```ts
  constructor(
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  const url = this.config.get('DATABASE_URL', { infer: true });
  ```

- **New key**: declare it in `EnvironmentVariables`, add it to `.env.example`
  and the README table, and, if required, add a placeholder value to
  `test/test-environment.ts` so e2e tests continue to start.
- Validation errors name the key but **never** print its value: a failed startup
  log must not leak a secret.
- TypeORM `synchronize: true` is only for development. Use migrations in
  production.

## Database

- `src/config/database.config.ts` builds connection options from the **already
  validated** environment. It does not validate again: if execution reaches it,
  configuration is valid.
- It accepts `DATABASE_URL` (production, Railway) **or** individual `DB_HOST`,
  `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` variables (development;
  the same variables read by `docker-compose.yml`). When both are present, the
  URL wins. `validateEnvironment` verifies that one is present.
- `src/database/database.module.ts` registers `TypeOrmModule.forRootAsync` so
  configuration resolves after `ConfigModule` reads the environment.
- `src/database/data-source.ts` is the migration CLI `DataSource`. It reuses the
  same factory and validator, so the application and migrations cannot target
  different databases. The factory's `synchronize: true` is harmless: the CLI
  overrides it to `false` during initialization.
- Entities are discovered by convention (`*.entity.ts`); a new one needs no
  manual registration.
- **Changed an entity? Generate a migration** with
  `pnpm migration:generate src/database/migrations/<Name>`, review the file
  (TypeORM can mistake a rename for `drop` plus `create`), and commit it with
  the change. In development, `synchronize` updates the schema automatically
  and is easy to forget; it is disabled in production. The complete workflow,
  including the conflict between `synchronize` and `migration:run`, is in the
  [README](../../README.md#migration-workflow).
- Start the local database with `pnpm db:up`. See the README for details.
- **E2E tests open a real connection**, so they require the database to be
  running.

## Queues and Jobs

The asynchronous messaging infrastructure (F12, `src/messaging/`) uses RabbitMQ
through `@golevelup/nestjs-rabbitmq`, a publisher that business code can use
without knowing AMQP details, and a worker running as a separate process
(`src/worker.ts`, without HTTP). It has no functional jobs yet, only the
infrastructure and an example job.

- **Publish a job**: `MessagingService.publish(JobType.X, payload)`. Business
  code does not know exchanges, routing keys, or any RabbitMQ detail.
- **Add a handler**: place it in `src/messaging/worker/handlers/`, decorate it
  with `@RabbitSubscribe`, and **delegate to `JobProcessorService.process()`**.
  That provides consistent retries, DLQ handling, and logging. Do not manage
  ack/nack manually.
- **Handler errors**: `RetryableJobError` for a transient failure (retry it) and
  `PermanentJobError` when retrying is not worthwhile (send it directly to the
  DLQ). An unclassified error is retryable. Never throw `HttpException` in a
  handler: `HttpExceptionFilter` is only for the HTTP context, which the worker
  does not have.
- **At least once**: a job can execute more than once if the worker fails before
  acknowledgment. Write handlers that tolerate this.
- **Never log the complete payload**: it can contain PII (location, user data).
  Log events (`job_started`, `job_completed`, `job_retry_scheduled`,
  `job_failed`, `job_dead_lettered`, `job_infra_failure`) contain the id, type,
  attempt, and correlationId, not the content.
- **Adding a job type** requires an entry in `JobType`
  (`src/messaging/types/job-type.ts`), its retry queues declared in
  `src/messaging/messaging.config.ts` (one for each delay configured in
  `RABBITMQ_RETRY_DELAYS_MS`), and the handler. The topology is deliberately
  explicit; it is not generated automatically.

Full topology details (exchanges, queues, ACK/NACK, and error classification)
are in `docs/architecture.md`.

### Seed Data

`pnpm db:seed` loads data without which the system cannot start: `user` and
`administrator` roles, `resource.action` permissions and their role assignments,
user, plan, category, and feedback statuses, and initial catalog categories.

- **Add a catalog value to
  [`src/database/seeds/definitions.ts`](../../src/database/seeds/definitions.ts),
  not a migration.** Migrations run once; the seed script runs again and loads
  only missing values.
- **Role-permission assignments belong within each permission** (`roles` field).
  There is no separate key list that can become unsynchronized.
- **The seed neither overwrites nor restores rows.** It inserts only missing
  values: administration edits `name` and `description` (CU54, CU61, CU62), and
  soft deletion is deliberate. Existence is checked with `withDeleted: true`,
  which also prevents duplicates because model unique indexes are partial
  (`WHERE deleted_at IS NULL`).
- **After adding a value, run `pnpm test`.** `definitions.spec.ts` checks without
  a database that `key` is not repeated, fits the column, and has existing
  assigned roles.
- Code comparing against a catalog uses `key`, never `name` or `id`: ids are
  `SERIAL` and vary between databases.

Details are in the [README](../../README.md#seed-data).

## Error Handling

- Use NestJS exceptions (`NotFoundException`, `BadRequestException`,
  `ForbiddenException`, `ConflictException`), not `throw new Error()`.
- Do not leak internal details (stack traces or SQL) in responses to clients.
- **This applies to the HTTP context.** The worker (`src/worker.ts`) has no
  request/response; classify its errors with `RetryableJobError` and
  `PermanentJobError` (see "Queues and Jobs" above), not Nest exceptions or
  `HttpExceptionFilter`.
- `HttpExceptionFilter` is registered globally. All errors, including nonexistent
  routes and unexpected exceptions, use the same contract:

  ```json
  {
    "statusCode": 404,
    "code": "PLAN_NOT_FOUND",
    "message": "The requested plan does not exist",
    "path": "/api/plans/99",
    "timestamp": "2026-08-15T18:30:00.000Z"
  }
  ```

- `statusCode` serves the protocol; `code` is a stable `SCREAMING_SNAKE_CASE`
  identifier that the frontend can interpret; `message` is human-readable.
  `path` and `timestamp` help diagnose problems without exposing internal data.
- For a domain-specific error, pass `code` and `message` in the exception:

  ```ts
  throw new NotFoundException({
    code: 'PLAN_NOT_FOUND',
    message: 'The requested plan does not exist',
  });
  ```

- Validation failures add `errors`, a list of `{ field, messages }`. It is the
  only optional field in the common contract.
- A non-HTTP exception is logged by the server and returns `500`,
  `INTERNAL_ERROR`, and a generic message. Never return its message or stack.

### HTTP Status Code by Failure Type

| Code                        | When to use it                                           | Typical exception                              |
| --------------------------- | -------------------------------------------------------- | ---------------------------------------------- |
| `400 Bad Request`           | Invalid DTO, query, or format                            | `BadRequestException`                          |
| `401 Unauthorized`          | Missing, invalid, or expired token                       | `UnauthorizedException`                        |
| `403 Forbidden`             | Valid identity without permission for the operation      | `ForbiddenException`                           |
| `404 Not Found`             | The identified resource does not exist                   | `NotFoundException`                            |
| `405 Method Not Allowed`    | The route exists but does not accept that verb            | Handled by the HTTP layer                      |
| `409 Conflict`              | Duplicate or transition incompatible with current state  | `ConflictException`                            |
| `422 Unprocessable Entity`  | Valid format that violates a business rule                | `UnprocessableEntityException`                 |
| `429 Too Many Requests`     | Request limit exceeded                                   | `TooManyRequestsException` or equivalent guard |
| `500 Internal Server Error` | Unexpected server failure                                | Normalized by the global filter                |
| `503 Service Unavailable`   | A required dependency is temporarily unavailable         | `ServiceUnavailableException`                  |

Do not use `401` for permissions (`403`), `404` to hide a conflict, or `500` for
a known business condition. The filter assigns a generic `code` by status when
the exception does not declare its own.

## Tests

- Unit tests alongside code: `plans.service.spec.ts`.
- E2E tests in `test/`.
- A CU should not be considered complete without at least one happy-path test.
