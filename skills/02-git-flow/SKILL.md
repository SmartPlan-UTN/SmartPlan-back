---
name: smartplan-git-flow
description: Branch, protection, pull-request, and commit-message rules. Read before any Git operation.
---

# SmartPlan - Git Workflow

> Shared core. This file is identical in `SmartPlan-front` and `SmartPlan-back`.
> Replicate any change in the other repository.

## Rule Number One

**Never commit while on `main` or `develop`.** Both are protected in GitHub and a
push will be rejected with `GH006: Protected branch update failed`.

If a commit was made on the wrong branch, preserve the work:

```bash
git switch -c <branch-name>      # carries the commit to the new branch
git branch -f main origin/main   # restores main to the remote state
```

## Branch Structure

```
main        production; protected; accepts merges only from develop.
develop     integration; protected; base for all work branches.
<branch>    daily work; starts from and returns to develop through a PR.
```

## Branch Protection

Applies to `main` and `develop`:

- Require a pull request before merging.
- Require **two approvals**.
- Dismiss stale pull-request approvals when new commits are pushed.
- Require the `CI` check (lint, test, and build; see `skills/06-testing/`).
- Do not allow bypassing these settings.

There are no shortcuts, including for administrators. Every change enters through a
PR with two reviews and a passing `CI` check.

## Branch Names

```
SMART-<ticket-id>-<short-kebab-case-description>
```

`<ticket-id>` is the sprint ticket identifier shown in brackets in the issue title.
Historical branch names, such as `SMART-f02-configuracion-por-variables-de-entorno`,
are retained as factual identifiers.

If a task has no ticket, use a descriptive prefix:

```
feature/<description>     new functionality
fix/<description>         bug fix
chore/<description>       configuration, dependencies, tooling
```

## Work Cycle

```bash
git switch develop
git pull
git switch -c SMART-fXX-description

# ... work and commit ...

pnpm lint
git push -u origin SMART-fXX-description
```

Open the PR with `develop` as its base, not `main`, and close the issue through the
PR description with `Closes #NN`.

## Commit Messages

Write commit messages in English, in the imperative mood, and reference the use
case when applicable. The issue number belongs in the PR through `Closes #NN`.

```
Implement automatic plan generation (CU17)

Add the POST /api/plan-requests endpoint and service that combines activities
according to budget and available time.
```

For work without an associated CU, use one descriptive line:

```
Configure ESLint static analysis
```

## PR Description

A PR should answer three questions:

1. **What it does** and which CU or US it covers.
2. **How to test it** with concrete commands.
3. **What remains out of scope**, if any.

## Do Not

- Commit on `main` or `develop`.
- Run `git push --force` on shared branches.
- Merge your own PR without two approvals.
- Commit `.env`, credentials, or API keys.
- Commit `node_modules/` or `.next/`.
