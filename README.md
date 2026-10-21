# SmartPlan Back

SmartPlan's REST API generates personalized recreational plans based on budget,
location, available time, outing type, and preferences. It is the 2026 final
project for Information Systems Engineering at UTN Facultad Regional Mendoza.

## Stack

NestJS 11, TypeScript, PostgreSQL, TypeORM, Jest, ESLint, Prettier, and pnpm.
The frontend is in `SmartPlan-front` (Next.js 16).

## Requirements and Quick Start

- Node.js 24 (see `.nvmrc`)
- pnpm 11.21.0
- Docker with Docker Compose

```bash
pnpm install
cp .env.example .env
pnpm db:up
pnpm start:dev
pnpm db:seed
```

The API is at `http://localhost:3001/api`. `pnpm db:up` starts PostgreSQL and
RabbitMQ. The API starts its RabbitMQ consumer automatically in a native
`node:worker_threads` thread; no second application command is needed.
Interactive OpenAPI documentation is available at
`http://localhost:3001/api/docs`.

## Configuration

Use `.env.example` as the template. Do not commit `.env`. `ConfigModule` is
global and validates variables at startup in
[`src/config/environment-variables.ts`](src/config/environment-variables.ts).
Use `ConfigService` for configuration access.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | No | `development` | Environment |
| `PORT` | No | `3001` | HTTP port |
| `FRONTEND_URL` | No | `http://localhost:3000` | Allowed CORS origin |
| `CORS_ORIGINS` | No | `FRONTEND_URL` | Comma-separated CORS origins; `FRONTEND_URL` remains the recovery-link origin |
| `DATABASE_URL` or `DB_*` | Yes | - | PostgreSQL connection |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Yes | - | JWT signing |
| `RESEND_API_KEY`, `EMAIL_FROM` | Yes | - | Password-recovery email |
| `GOOGLE_MAPS_API_KEY`, `GEMINI_API_KEY` | Yes | - | External integrations |
| `RABBITMQ_URL` | No | Local SmartPlan URL | RabbitMQ connection |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | No | - | Railway private image bucket |
| `MCP_OWNER_USER_ID` | No | first administrator | Owner of the plans loaded through the MCP server (`docs/mcp.md`) |

## Database and Migrations

Entities are discovered from `src/**/*.entity.ts`. In development and test,
`synchronize` is enabled; production disables it and runs pending migrations at
startup. Every entity change requires a migration.

```bash
pnpm migration:generate src/database/migrations/<Name>
pnpm migration:run
pnpm migration:revert
```

The schema is created by a single initial migration,
[`1787671826564-InitialSchema.ts`](src/database/migrations/1787671826564-InitialSchema.ts),
generated from the entities. It replaces the earlier chain, which described a
rename from the original Spanish schema and could not run on an empty database.
Every entity change from now on adds its own migration on top.

Seed definitions are in
[`src/database/seeds/definitions.ts`](src/database/seeds/definitions.ts).
`pnpm db:seed` is idempotent and inserts missing catalog data only.

## Commands

```bash
pnpm start:dev
pnpm build
pnpm lint
pnpm test
pnpm test:e2e
pnpm db:up
pnpm db:down
pnpm db:seed
pnpm db:seed:prod
```

E2E tests require local services and use the isolated database ending in
`_test`. CI runs `pnpm lint`, `pnpm test`, and `pnpm build`.

## Native Worker Lifecycle

Run one API instance. `pnpm start:dev` (or `pnpm start:prod` after building)
starts both HTTP and the consumer thread. RabbitMQ, its durable queues,
publisher confirms, retry delays and DLQ remain unchanged. `RABBITMQ_PREFETCH`
still bounds message concurrency; one thread also owns the feedback scheduler.

The thread has its own NestJS context and PostgreSQL connection, but neither an
HTTP port nor a separate deployment. It receives only validated database,
RabbitMQ and provider configuration, never the API's JWT/email/storage secrets.
It does not run schema synchronization or migrations.

The API waits for consumer readiness before accepting traffic and replaces a
crashed thread with bounded backoff. New publishing is rejected while the thread
is unavailable. Before startup/replacement, outstanding plan requests and sync
runs are marked failed (`WORKER_INTERRUPTED` for plans), rather than resumed.
RabbitMQ may redeliver their messages; handlers skip those terminal rows.
Ordinary job failures still use the existing RabbitMQ retry/DLQ policy and
generation retains its original 30-second deadline. API shutdown terminates the
thread; the next startup marks any outstanding domain rows failed.

## Documentation

- [Documentation index](docs/README.md)
- [Project](docs/project.md)
- [Domain](docs/domain.md)
- [Architecture](docs/architecture.md)
- [Development](docs/development.md)
- [OpenAPI and Swagger](docs/api-documentation.md)
- [Authentication](docs/authentication.md)
- [Quality](docs/quality.md)
- [Testing](docs/testing.md)
- [Deployment](docs/deployment.md)
- [Contributing](docs/contributing.md)
- [Technical decisions](docs/decisions.md)
- [Operational tracking](TRACKING.md)

Agent instructions are in [AGENTS.md](AGENTS.md); canonical operating skills
are in [skills/](skills/README.md).
