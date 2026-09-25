# SmartPlan - Definition of Done

> Shared core. This file is identical in `SmartPlan-front` and `SmartPlan-back`.
> Replicate any change in the other repository.

An issue is not complete merely because it works locally. It is complete only when
all applicable items below are satisfied.

## Scope

- Meet every issue acceptance criterion. Document excluded scope in the PR.
- Create a separate issue for technical debt; a `TODO` is not a work plan.

## Code

- `pnpm lint` and `pnpm build` pass.
- Do not hardcode credentials, tokens, or URLs. Use environment variables.
- Do not leave debug `console.log` calls or commented-out code.
- Use English domain names consistently, as defined in `skills/01-domain/`.
- Every `eslint-disable` includes a written reason.

## Backend

- Validate every API input with a DTO and `class-validator`.
- Never expose sensitive fields, including passwords, tokens, or hashes.
- `pnpm test` passes, with at least one success and one error-path test for the use case.
- Every schema change includes a migration; do not rely on `synchronize`.

## Frontend

- `pnpm test` passes.
- Use design-system tokens, cover loading/error/empty states, and test responsive
  behavior and basic keyboard accessibility.
- Do not use `any` or unhandled promises.

## Git and Review

- Branch from `develop` using `SMART-<id>-<description>`.
- Target `develop`, never `main`.
- State what the PR does, how to test it, and what remains out of scope.
- Close the issue with `Closes #NN`.
- Obtain two approvals and resolve conflicts with `develop`.

## Documentation

- Update [`TRACKING.md`](../../TRACKING.md) with status, date, branch, and PR.
- Record non-obvious technical decisions in its _Decisions_ section.
- Update the relevant skill when changing a convention, and replicate shared skills
  in the other repository.

## Status Transitions

| Status         | When                                             |
| -------------- | ------------------------------------------------ |
| `In progress`  | A branch with real work is open.                 |
| `In review`    | A PR is open and awaiting two approvals.         |
| `Completed`    | The PR is merged into `develop`.                 |

A use case is not completed while its PR is open. A frontend use case is not
complete until its backend endpoint exists and is integrated.

## Not Part of the DoD

- A global frontend coverage threshold.
- Deployment: merging into `develop` does not deploy; production deploys from `main`.
- Pixel-perfect design review.

## Changing This Document

This document was agreed during Sprint 0 refinement and applies to both repositories.
Change it through a PR with two approvals and explain the reason in the PR description.
