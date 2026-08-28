# SmartPlan Back Documentation

This directory contains stable project documentation. Task instructions are in
[`../skills/`](../skills/README.md); dynamic status is tracked in
[`../TRACKING.md`](../TRACKING.md) and GitHub Issues.

| Document                              | Contents                                                            |
| ------------------------------------- | ------------------------------------------------------------------- |
| [Project](project.md)                 | Purpose, scope, team, stack, and modules                            |
| [Domain](domain.md)                   | Vocabulary, entities, use cases, and traceability                   |
| [Architecture](architecture.md)       | Components, dependencies, integrations, and implementation status   |
| [Development](development.md)         | Local requirements, configuration, execution, and HTTP API          |
| [OpenAPI and Swagger](api-documentation.md) | Interactive API contract, authentication, maintenance, and logging |
| [Quality](quality.md)                 | Formatting, static analysis, tests, and acceptance criteria         |
| [Testing](testing.md)                 | Unit tests, e2e tests, and the isolated database                    |
| [Authentication](authentication.md)   | HTTP contract, tokens, cookies, and CU1-CU4 codes                   |
| [User Management](user-management.md) | Profile, password, account deletion, and preferences (CU5-CU8)      |
| [Administration API](administration-api.md) | Admin management and REP-01 contract (CU53, CU55, CU57, CU58, CU60) |
| [Planning](planning.md)               | Private own-plan management, costs, and CU31 provisional contract    |
| [Ratings](ratings.md)                 | Ratings, moderation, and activity averages (CU44-CU47)               |
| [Exploration API](exploration-api.md) | Search, filters, details, and map contract (CU9-CU14, CU16)         |
| [Favorites API](favorites-api.md)     | Saving and removing favorite activities and plans (CU15, CU39-CU43) |
| [Collections API](collections-api.md) | User-created activity groupings and the CU32-CU38 contract          |
| [Deployment](deployment.md)           | Environments and publishing guidelines                              |
| [Contributing](contributing.md)       | Git workflow, commits, pull requests, and documentation maintenance |
| [Decisions](decisions.md)             | Current and pending technical decisions                             |

## Maintenance Criteria

- Update this directory when a stable system decision, contract, or behavior changes.
- Update a skill when the workflow for that topic changes.
- Update `TRACKING.md` when completing relevant work, finding a blocker, or recording an operational follow-up.
- Do not document planned work as implemented; state its status explicitly.
