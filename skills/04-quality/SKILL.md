---
name: smartplan-quality
description: Backend static-analysis conventions with ESLint and Prettier. Read before disabling a rule or silencing a warning.
---

# SmartPlan Back - Quality and Static Analysis

## Tools

**ESLint 9** uses a flat configuration (`eslint.config.mjs`) with
**typescript-eslint** and **Prettier** as an ESLint rule (`eslint-plugin-prettier`).

## Commands

```bash
pnpm lint        # static analysis; does not modify files
pnpm lint:fix    # static analysis with automatic fixes
pnpm format      # format with Prettier
pnpm test        # unit tests
```

Run `pnpm lint` and `pnpm test` before opening a PR.

## Configuration

`eslint.config.mjs` uses:

- `@eslint/js` `recommended`
- `typescript-eslint` `recommendedTypeChecked`
- `eslint-plugin-prettier/recommended`

It also configures Node and Jest globals, `projectService: true`, and these rules:

| Rule                                      | Severity | Notes                                      |
| ----------------------------------------- | -------- | ------------------------------------------ |
| `@typescript-eslint/no-explicit-any`      | `error`  | Same standard as `SmartPlan-front`.        |
| `@typescript-eslint/no-floating-promises` | `warn`   | Promise without `await` or `.catch()`.     |
| `@typescript-eslint/no-unsafe-argument`   | `warn`   | Passing `any` to a typed parameter.        |
| `prettier/prettier`                       | `error`  | Uses `endOfLine: "auto"` for Windows.     |

`lint` is verification-only; `lint:fix` applies automatic corrections. This prevents
lint verification from silently changing files.

## Resolving Lint Errors

In order of preference:

1. Fix the code.
2. Prefix intentionally unused variables with `_`.
3. If a line must be ignored, add a disable with a written reason:

```ts
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- library X does not type the callback
```

Do not disable a rule in `eslint.config.mjs` merely to suppress noise. Discuss and
document systematic issues in the PR.

## Conventions ESLint Does Not Enforce

- Code, files, and identifiers are English; see `skills/01-domain/`.
- Validate every API input using DTOs and `class-validator`.
- Keep credentials and secrets out of code; use environment variables.
- Never return entities with sensitive fields, including passwords and tokens.
- Do not complete a CU without at least one success-path test.
