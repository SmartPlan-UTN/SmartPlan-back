# SmartPlan Back - AI Agent Instructions

This file is the shared entry point for OpenCode, Codex, Claude Code, and GitHub
Copilot. Detailed, actionable rules are in [skills/](skills/README.md).

## Context

SmartPlan generates personalized recreational plans based on budget, location,
available time, outing type, and preferences. This repository contains the
NestJS REST API; the web client is in `SmartPlan-front`.

See [docs/README.md](docs/README.md) for stable project documentation and
[TRACKING.md](TRACKING.md) for operational status, decisions, and blockers.

## Required Reading

| File                                                                 | When to read it                                             |
| -------------------------------------------------------------------- | ----------------------------------------------------------- |
| [`skills/00-project/SKILL.md`](skills/00-project/SKILL.md)         | Always first: system, scope, modules, team, and stack       |
| [`skills/01-domain/SKILL.md`](skills/01-domain/SKILL.md)           | Before naming entities, tables, routes, endpoints, or DTOs  |
| [`skills/02-git-flow/SKILL.md`](skills/02-git-flow/SKILL.md)       | Before any Git operation                                    |
| [`skills/02-git-flow/DEFINITION-OF-DONE.md`](skills/02-git-flow/DEFINITION-OF-DONE.md) | Before declaring a task complete                 |
| [`skills/03-backend/SKILL.md`](skills/03-backend/SKILL.md)         | Before writing controllers, services, or entities           |
| [`skills/04-quality/SKILL.md`](skills/04-quality/SKILL.md)         | Before disabling a rule or silencing a warning              |
| [`skills/05-architecture/SKILL.md`](skills/05-architecture/SKILL.md) | Before adding an integration or background process        |
| [`skills/06-testing/SKILL.md`](skills/06-testing/SKILL.md)         | Before writing the first test for a use case                |
| [ROADMAP](https://github.com/SmartPlan-UTN/SmartPlan-front/blob/develop/ROADMAP.md) | Owner, estimate, and sprint for every issue in both repositories |

## Non-Negotiable Rules

1. Never commit directly to `main` or `develop`; work branches start from `develop` and return through a PR with two approvals.
2. Use `pnpm`, never npm or yarn.
3. Write all code in English: files and directories, identifiers, singular `snake_case` tables, `PascalCase` classes, plural `kebab-case` routes, API contracts, code comments, and tests. User-visible text may remain in Spanish.
4. Validate every HTTP input with DTOs and `class-validator`; never read raw request bodies.
5. Never return passwords, tokens, or other sensitive fields.
6. Never write secrets in code or commit `.env`.
7. Use `ConfigService` for configuration; do not access `process.env` outside the configuration layer.
8. Run `pnpm lint` and `pnpm test` before declaring a code change complete; integrated changes also require `pnpm test:e2e`.
9. Reference the use case in commits and PRs when applicable.
10. Update `TRACKING.md` when closing relevant work: global status, decision, blocker, or log entry. GitHub Issues and PRs are the source of active tasks.

## Verifiable Status

The project is in its **foundations** phase: it has environment configuration,
a PostgreSQL connection through TypeORM, unit/e2e tests, the **37 original model
entities plus CU51's `ExternalDataUsage` trace entity** under
`src/<module>/entities/`, the initial migration and subsequent feature migrations,
and seed data (roles, permissions, statuses, and categories) loaded by
`pnpm db:seed`. It also includes authentication and access control for CU1-CU4
in `src/auth/`: registration, login, sessions/refresh, password recovery, and
global role and permission guards.

The remaining business modules (plans, activities, profiles, administration,
and so on) do **not** exist yet. Verify capabilities in the code and relevant
documentation before assuming they exist.

Every entity change needs its own migration: `synchronize` automatically adjusts
the schema in development and is easy to overlook, but is disabled in production.
The workflow is in the [README](README.md#migration-workflow).

A new catalog value (a permission or status) belongs in
`src/database/seeds/definitions.ts` and is loaded with the idempotent
`pnpm db:seed`. It does not need a migration: it is data, not schema.

## Verification Commands

```bash
pnpm db:up         # start local PostgreSQL
pnpm db:seed       # seed data (idempotent)
pnpm lint
pnpm test
pnpm test:e2e      # against the isolated smartplan_test database
pnpm build
```

## Documentation Scope

- `docs/` documents the project, domain, architecture, and stable decisions.
- `skills/` contains concrete instructions for performing work correctly.
- `TRACKING.md` records temporary operational information.

When a rule appears both here and in a skill, the skill provides the specific
detail. If it contradicts the code, verify the situation and document the
decision before extending the behavior.
