# Development and Configuration

## Requirements and Setup

- Node.js 24 (see `.nvmrc`)
- pnpm 11.21.0 (see `packageManager` in `package.json`)
- Docker with Docker Compose for local PostgreSQL and RabbitMQ

```bash
pnpm install
cp .env.example .env
pnpm db:up
pnpm start:dev
pnpm db:seed
```

The API is available at `http://localhost:3001/api`. E2E tests use the isolated
`smartplan_test` database by default. RabbitMQ queues are shared by the local
broker, so stop the development API (including its native thread) before running e2e tests and do not mix
development and test workers against the same queue.

The API automatically starts its RabbitMQ consumer using `node:worker_threads`.
There is no second worker command. Use a single API instance; interrupted jobs
are marked failed at startup or before replacing a crashed thread.

## Seeds

`pnpm db:seed` loads the required catalog data: `user` and `admin` roles,
permissions, statuses, and initial categories. It is idempotent: it inserts
missing rows only, does not overwrite existing catalog values, and does not
restore soft-deleted rows. Seed definitions are in
[`src/database/seeds/definitions.ts`](../src/database/seeds/definitions.ts),
and execution is in [`src/database/seeds/seed.ts`](../src/database/seeds/seed.ts).

Production uses `pnpm db:seed:prod` after building because `pnpm db:seed` uses
the development-only `ts-node` dependency.

## Environment Variables

Configuration is validated at startup in
[`src/config/environment-variables.ts`](../src/config/environment-variables.ts).

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | No | `development` | `development`, `test`, or `production` |
| `PORT` | No | `3001` | HTTP port |
| `FRONTEND_URL` | No | `http://localhost:3000` | Allowed CORS origin |
| `DATABASE_URL` | One connection form | - | PostgreSQL URL; takes precedence over `DB_*` |
| `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | One connection form | See `.env.example` | Local database connection |
| `DB_PORT` | No | `5432` | PostgreSQL port |
| `DB_SSL` | No | `false` | PostgreSQL SSL |
| `DB_NAME_TEST` | No | `<DB_NAME>_test` | E2E-only database |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Yes | - | Distinct JWT signing secrets |
| `EMAIL_TRANSPORT` | No | `resend` | `resend` sends through the provider; `log` writes the recovery link to the log instead (rejected in production) |
| `RESEND_API_KEY` | Only with `EMAIL_TRANSPORT=resend` | - | Resend API key |
| `EMAIL_FROM` | Yes | - | Sender address for password-recovery email |
| `GOOGLE_MAPS_API_KEY`, `GEMINI_API_KEY` | Yes | - | Current required external integration configuration |
| `GEMINI_MODEL` | No | `gemini-3.6-flash` | Gemini model |
| `RABBITMQ_URL` | No | Local SmartPlan URL | RabbitMQ connection |

Never version `.env`. When adding a variable, update the validation schema,
`.env.example`, this table, and test environment configuration as needed.

## HTTP Contract

[`src/config/configure-application.ts`](../src/config/configure-application.ts)
configures both the production application and e2e application. The API has a
global `/api` prefix, CORS restricted to `FRONTEND_URL`, and global DTO
validation from
[`src/common/validation/configure-validation.ts`](../src/common/validation/configure-validation.ts).

Unknown DTO fields are rejected. Invalid input returns a `400` response with a
stable `code` and field-level `errors`; see
[`src/common/dto/validation-example.dto.ts`](../src/common/dto/validation-example.dto.ts).
The implemented authentication contract is in
[Authentication](authentication.md).

## Which database am I talking to? (local, staging, production)

`.env` may hold the variables of a deployed environment. That must never make
a developer process touch it, so the application decides **before connecting**:

* A **local** database host is always allowed.
* A **remote** host is allowed only when the process runs on the deployment
  platform (Railway sets `RAILWAY_*`), or when you opt in per process with
  `ALLOW_REMOTE_DATABASE=<exact host>`.
* A remote database reached from outside the platform is **never synchronised
  and never migrated** unless you also set `ALLOW_REMOTE_MIGRATIONS=true`.
* The effective target (`host:port/database [local|REMOTE]`, never the
  credentials) is logged at start-up.

### Local workflow

1. `cp .env.local.example .env.local` and point it at your local PostgreSQL.
   `.env.local` is loaded before `.env` (first value wins) and is git-ignored.
2. `pnpm start:dev`, `pnpm start:worker:dev`, `pnpm db:seed`, `pnpm catalog ...`
   all use that database. With no `.env.local` and a remote `.env` they stop
   with `Refusing to connect to the remote database ...`.
3. Catalog writes have a second guard (see `docs/catalog.md`): the CLI only
   writes to the approved local database unless `--environment` and
   `--allow-remote` are given.

### Staging / production

Deployed services get their configuration from the platform. Promoting a
catalog is an explicit operation:

```bash
ALLOW_REMOTE_DATABASE=<host> pnpm catalog import pkg.json --dry-run \
  --environment staging --allow-remote <host>
```

Import with `--confirm <database>` only after reviewing the dry-run, and run
migrations by deploying the service, not from a laptop.
