# Quality

## Minimum Checks

Before completing a code change, run:

```bash
pnpm lint
pnpm test
pnpm build
```

The `CI` workflow (`.github/workflows/ci.yml`) runs these commands on each pull
request targeting `develop` or `main`; the resulting check is required before
merging.

For changes affecting the integrated application, start PostgreSQL and run:

```bash
pnpm test:e2e
```

`test:e2e` is conditional and is not part of the CI gate because it requires
real PostgreSQL and RabbitMQ services.

## Tools

| Tool | Use |
| --- | --- |
| ESLint 9 | Type-aware static analysis |
| Prettier 3 | Formatting |
| Jest 30 | Unit and e2e tests |
| TypeScript | Compilation checks through the NestJS build |

Detailed configuration and warning handling are in the
[quality skill](../skills/04-quality/SKILL.md).

## Technical Acceptance Criteria

- Validate HTTP input with DTOs and `class-validator`.
- Exclude sensitive data from responses.
- Keep secrets outside source code and Git.
- Use NestJS HTTP exceptions for expected errors.
- Add at least one happy-path test per implemented CU.
- Follow the project's English source naming conventions.

See [Testing](testing.md) and the [testing skill](../skills/06-testing/SKILL.md)
for isolation, mocks, and suite conventions.
