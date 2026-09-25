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
