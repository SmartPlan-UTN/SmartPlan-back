# Contributing

## Branch Workflow

```text
main <- develop <- work branch
```

`main` and `develop` are protected. Do not commit directly or merge without a
pull request and two approvals.

Ticket branches use:

```text
SMART-<ticket-id>-<short-kebab-case-description>
```

For work without a ticket, use `feature/`, `fix/`, `docs/`, or `chore/`.

## Work Cycle

1. Branch from `develop`.
2. Read the applicable skills before editing.
3. Implement the change with the required tests and documentation.
4. Run quality checks.
5. Open a pull request to `develop`, including `Closes #NN` when an issue exists.
6. Update `TRACKING.md` when the work records a decision, blocker, or operational milestone.

## Commits and Pull Requests

Commits are written in Spanish, use the imperative mood, and reference the CU
when applicable. For example:

```text
Implement automatic plan generation (CU17)
```

The pull request must describe what it does, how to test it, the CU/US it
covers, and what remains out of scope. Do not include secrets, `.env` files,
generated artifacts, or unrelated changes.

See the complete workflow in the [Git skill](../skills/02-git-flow/SKILL.md).
