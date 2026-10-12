# Deployment

## Status

This repository has no verified production infrastructure or CI/CD deployment
pipeline. TypeORM is configured to run migrations at startup in `production`;
the rest of this document describes the intended deployment.

## Target Deployment

| Component | Planned platform |
| --- | --- |
| Frontend | Vercel |
| Backend and PostgreSQL | Railway |
| Images | Amazon S3 |
| Queues | Railway private RabbitMQ service with a volume |

`main` is the production branch and `develop` is the integration branch. Work
branches are integrated through approved pull requests.

## Railway: API, Worker, and RabbitMQ

Three services are required: `smartplan-api` (`pnpm start:prod`),
`smartplan-worker` (`pnpm start:worker:prod`), and RabbitMQ using
`rabbitmq:4.1-management-alpine`.

- Mount a Railway volume at `/var/lib/rabbitmq` so durable queues and the DLQ
  survive redeployments.
- Keep RabbitMQ on the private network; do not expose ports 5672 or 15672.
- Configure `RABBITMQ_URL` for both API and worker. The API also requires its
  database, JWT, email, and external API configuration.
- Workers can scale horizontally; RabbitMQ distributes work among consumers.
- API and worker wait for a healthy RabbitMQ connection at startup.

## Prerequisites

1. Run lint, tests, and build successfully.
2. Configure secrets only in the deployment platform.
3. Use TypeORM migrations in production; never enable `synchronize`.
4. Configure CORS, public URL, logging, and monitoring when the environment exists.
5. Document the effective procedure once infrastructure is verified.

## Catalog platform in production

Variables (all optional; see `.env.example`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `CATALOG_AUTO_RECOMMEND_MIN_PRICE_CONFIDENCE` | `LOW` | Lowest price confidence automatic recommendation accepts. Raise to `MEDIUM`/`HIGH` as prices are curated. |
| `GOOGLE_PLACES_ENABLED` | `true` | Kill switch for every paid Google call. |
| `GOOGLE_CACHE_TTL_DAYS` | `28` | Lifetime of cached Google coordinates/ratings (terms allow at most 30). |
| `GOOGLE_CATALOG_MONTHLY_BUDGET_USD` | `25` | Stops the sync pass and photo serving when the estimated monthly spend is reached. |
| `GOOGLE_MAX_REQUESTS_PER_SECOND` | `5` | Client-side cap on outgoing Google requests. |

Promotion runbook (staging → production), run from a trusted machine with the
target environment's `DATABASE_URL`:

1. `pnpm catalog verify catalog-vN.json`
2. `pnpm catalog import catalog-vN.json --dry-run` and review the report.
3. `pnpm catalog import catalog-vN.json --confirm <database-name>`
4. `pnpm catalog report` and check the quality figures.
5. Rollback: import the previous package with `--archive-missing`.

Operational notes:

- Migrations `AddPriceModel` and `AddCatalogPlatform` run at API startup. The
  first one turns legacy zero prices into `UNKNOWN`; review them afterwards.
- The first nightly eligibility pass can reduce the set of activities that are
  recommended automatically (missing category, coordinates, or a short
  description). `pnpm catalog report` lists the reasons.
- Keep RabbitMQ private to the platform network. A public TCP proxy exposes the
  broker to the internet protected only by its credentials.
