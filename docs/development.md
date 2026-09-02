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
# In a second terminal:
pnpm start:worker:dev
pnpm db:seed
```

The API is available at `http://localhost:3001/api`. E2E tests use the isolated
`smartplan_test` database by default. RabbitMQ queues are shared by the local
broker, so stop development workers before running e2e tests and do not mix
development and test workers against the same queue.

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
| `RESEND_API_KEY`, `EMAIL_FROM` | Yes | - | Password-recovery email delivery |
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
