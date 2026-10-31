# SmartPlan Back - GitHub Copilot Instructions

The source of truth for this repository's conventions is
[`AGENTS.md`](../AGENTS.md) and [`skills/`](../skills/). **Read them before
proposing code.** The following is an operational summary.

## Context

SmartPlan automatically generates personalized recreational plans based on
budget, location, available time, outing type, and preferences. This repository
contains the REST API. The frontend is `SmartPlan-front` (Next.js 16).

## Stack

NestJS 11 · TypeScript 5.7 · TypeORM · PostgreSQL (driver `pg`) · Jest ·
ESLint 9 + Prettier · **pnpm** como gestor de paquetes.

## Conventions

- **All code and technical names are English.** Use singular `snake_case`
  tables (`plan_detail`), `PascalCase` classes (`PlanDetail`), `kebab-case`
  files (`plan-detail.entity.ts`), and plural `kebab-case` routes
  (`/api/plan-details`). User-visible text may remain in Spanish.
- Declare table names explicitly: `@Entity('plan_detail')`.
- Use one NestJS module per system module (`auth/`, `users/`, `plans/`,
  `recommendation/`, `collections/`, `favorites/`, `ratings/`), each with
  `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`, and `entities/`.
- Use the global `/api` prefix and standard REST verbs.
- **Validate every input with a DTO and `class-validator`.** Never read raw
  `req.body`.
- Use NestJS exceptions (`NotFoundException`, `BadRequestException`,
  `ForbiddenException`, `ConflictException`), not `throw new Error()`.
- Never return entities containing sensitive fields (passwords or tokens).

## Security

- **JWT** authentication; token in `Authorization: Bearer <token>`.
- Passwords are hashed with bcrypt or argon2, never stored in plain text.
- Credentials, JWT secrets, and API keys use environment variables. Never
  hardcode them. Never commit `.env`.
- TypeORM `synchronize: true` is development-only.

## Lint

Use typescript-eslint `recommendedTypeChecked` with Prettier as an ESLint rule.
Do not suggest unhandled promises (`no-floating-promises`) or formatting that
Prettier will rewrite.

## Git

`main` and `develop` are protected and require a PR with two approvals. Never
suggest committing directly to them. Work branches start from `develop` and use
`SMART-<ticket-id>-<short-kebab-case-description>`, for example
`SMART-f02-environment-variable-configuration`.

Write commit messages in English, in the imperative mood, and reference the use
case when applicable:

```
Implement automatic plan generation (CU17)
```
