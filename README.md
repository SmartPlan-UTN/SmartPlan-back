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
RabbitMQ; run the worker separately with `pnpm start:worker:dev`.
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
| `DATABASE_URL` or `DB_*` | Yes | - | PostgreSQL connection |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Yes | - | JWT signing |
| `RESEND_API_KEY`, `EMAIL_FROM` | Yes | - | Password-recovery email |
| `GOOGLE_MAPS_API_KEY`, `GEMINI_API_KEY` | Yes | - | External integrations |
| `RABBITMQ_URL` | No | Local SmartPlan URL | RabbitMQ connection |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | No | - | Railway private image bucket |

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
pnpm start:worker:dev
```

E2E tests require local services and use the isolated database ending in
`_test`. CI runs `pnpm lint`, `pnpm test`, and `pnpm build`.

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
