# SmartPlan Back Documentation

This directory contains stable project documentation. Task instructions are in
[`../skills/`](../skills/README.md); dynamic status is tracked in
[`../TRACKING.md`](../TRACKING.md) and GitHub Issues.

| Document | Contents |
| --- | --- |
| [Project](project.md) | Purpose, scope, team, stack, and modules |
| [Domain](domain.md) | Vocabulary, entities, use cases, and traceability |
| [Architecture](architecture.md) | Components, dependencies, integrations, and implementation status |
| [Development](development.md) | Local requirements, configuration, execution, and HTTP API |
| [Quality](quality.md) | Formatting, static analysis, tests, and acceptance criteria |
| [Testing](testing.md) | Unit tests, e2e tests, and the isolated database |
| [Authentication](authentication.md) | HTTP contract, tokens, cookies, and CU1-CU4 codes |
| [Exploration API](exploration-api.md) | Search, filters, details, and map contract (CU9-CU14, CU16) |
| [Deployment](deployment.md) | Environments and publishing guidelines |
| [Contributing](contributing.md) | Git workflow, commits, pull requests, and documentation maintenance |
| [Decisions](decisions.md) | Current and pending technical decisions |

## Maintenance Criteria

- Update this directory when a stable system decision, contract, or behavior changes.
- Update a skill when the workflow for that topic changes.
- Update `TRACKING.md` when completing relevant work, finding a blocker, or recording an operational follow-up.
- Do not document planned work as implemented; state its status explicitly.
