# skills/

SmartPlan project conventions for people and AI agents.

## Contents

| Directory          | Contents                                                     | Scope          |
| ------------------ | ------------------------------------------------------------ | -------------- |
| `00-project/`      | SmartPlan, its goal, scope, modules, team, and stack         | Shared         |
| `01-domain/`       | Entities, 62 use cases, screens, and glossary                | Shared         |
| `02-git-flow/`     | Branches, protection, PRs, and commit messages               | Shared         |
| `03-backend/`      | NestJS, TypeORM, JWT, validation, and module structure       | This repo only |
| `04-quality/`      | ESLint, Prettier, and quality criteria                       | This repo only |
| `05-architecture/` | Components, communication, technologies, and environments    | Shared         |
| `06-testing/`      | Unit tests, e2e tests, isolated database, and mocks          | This repo only |

**Shared** means the file must be identical in `SmartPlan-front` and
`SmartPlan-back`; replicate every change.

## Tool Consumption

`skills/` is the single source of truth. Tools read these instructions before
acting; their content is not copied into integration directories.

| Tool           | Entry point                                          |
| -------------- | ---------------------------------------------------- |
| Claude Code    | `CLAUDE.md` -> `AGENTS.md` y `.claude/skills/`       |
| OpenCode       | `opencode.json` -> `AGENTS.md` y `.opencode/skills/` |
| Codex          | `AGENTS.md`                                          |
| GitHub Copilot | `.github/copilot-instructions.md`                    |

`AGENTS.md` provides common instructions. Stable project documentation is in
[`docs/`](../docs/README.md).

### OpenCode Without Symlinks

Claude Code and OpenCode discover adapters under `.claude/skills/` and
`.opencode/skills/`. Each has a compatible identifier and directs the tool to
read its canonical file under `skills/`. This keeps content in one place and
works the same on Windows, macOS, and Linux without `core.symlinks` or
Developer Mode.

## Adding a Skill

1. Create a directory with a numeric prefix and a `SKILL.md`.
2. Add `name` and `description` front matter; the description must state when to use it.
3. Add it to this table and `AGENTS.md`.
4. If it is shared, replicate it in the frontend.

## Source

The content is based on `SmartPlan.md`, an academic document processed with OCR.
When ambiguity exists, verify the original document before making it a convention.
