# Domain and Traceability

## Naming Conventions

Current source code uses English technical names consistently.

| Layer | Convention | Example |
| --- | --- | --- |
| Database table / entity | English, singular `snake_case` | `plan_detail` |
| TypeScript class | English `PascalCase` | `PlanDetail` |
| File | `kebab-case` plus technical suffix | `plan-detail.entity.ts` |
| HTTP route | English, plural `kebab-case` | `/api/plan-details` |
| Function / variable | English `camelCase` | `calculatePlanCost()` |

The academic traceability matrix may retain Spanish functional terms. When it
does, map each term to one consistent English technical name; for example,
`usuario` is `user`, `actividad` is `activity`, and `retroalimentación` is
`feedback`.

## Entities by Area

| Area | Entities |
| --- | --- |
| Users and access | `user`, `role`, `permission`, `role_permission`, `user_session`, `user_status`, `user_preference`, `password_recovery` |
| Catalog | `activity`, `category`, `activity_category`, `category_status`, `place`, `activity_place` |
| Location | `department`, `city`, `country` |
| Plans | `plan`, `plan_detail`, `plan_status`, `plan_request`, `plan_request_category`, `request_status`, `outing_type` |
| Feedback | `feedback`, `feedback_status`, `rating` |
| Collections and favorites | `collection`, `favorite_collection`, `favorite_list`, `favorite_activity`, `favorite_plan` |
| External integration | `external_provider`, `external_sync` |
| System | `notification`, `system_parameter`, `audit_log` |

The class diagram in Appendix 5 of the academic document defines attributes and
relationships. Do not infer them from these names; inspect the current entities
under `src/<module>/entities/` before modeling a change.

## Use Cases

The 62 use cases are grouped into ten areas: authentication and access
(CU1-CU4), user management (CU5-CU8), search and exploration (CU9-CU16),
recommendations (CU17-CU23), planning (CU24-CU31), collections (CU32-CU38),
favorites (CU39-CU43), ratings (CU44-CU47), external integration (CU48-CU52),
and administration (CU53-CU62).

The complete CU table, descriptions, entities, and screens is in
[`skills/01-domain/SKILL.md`](../skills/01-domain/SKILL.md). GitHub Issues,
rather than this document, define implementation status.

## Traceability Chain

```text
Module -> CU -> US -> entities -> screen -> code -> tests
```

Every commit and pull request implementing a feature must reference its CU. A
use case is not complete without a happy-path test.

## Glossary

| Term | Definition |
| --- | --- |
| Plan | An ordered set of activities forming a social experience. |
| Plan detail | A plan item with an activity, schedule, and estimated cost. |
| Plan request | Parameters submitted to generate a plan. |
| Activity | A concrete catalog experience. |
| Place | The physical location where an activity occurs. |
| Collection | A group of activities created by a user. |
| Favorites list | Quick storage for activities and plans. |
| Feedback | Post-experience input that feeds recommendations. |
