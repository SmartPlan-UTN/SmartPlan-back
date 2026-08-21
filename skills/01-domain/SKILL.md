---
name: smartplan-domain
description: Data model entities, the 62 use cases, screens, and glossary. Consult before naming tables, endpoints, routes, or components.
---

# SmartPlan - Domain Model

> Shared core. This file is identical in `SmartPlan-front` and `SmartPlan-back`.
> If you modify it, replicate the change in the other repository.

## Naming Rule

The traceability matrix retains historical Spanish functional vocabulary, but code
uses English technical equivalents. Maintain a single, consistent translation
across the frontend, backend, API, and database.

| Layer                   | Convention                     | Example               |
| ----------------------- | ------------------------------ | --------------------- |
| Tables / entities       | English, `snake_case`, singular | `plan_detail`       |
| TypeScript classes      | English, `PascalCase`          | `PlanDetail`          |
| API routes              | English, `kebab-case`, plural  | `/api/plan-details`   |
| Variables and functions | English, `camelCase`           | `calculatePlanCost()` |

Do not invent different synonyms for the same concept. A `plan` remains a
`Plan`; legacy `usuario` is implemented as `User`, `actividad` as `Activity`,
and `retroalimentacion` as `Feedback`.

## Entities

**37 tables.** Names and attributes come from the **class diagram** (Appendix
No. 5). Where the diagram and traceability matrix differ, the diagram prevails:
it is the approved data model.

`report` and `report_type` appear in the diagram but are **out of scope**:
reports REP-01 and REP-02 are produced by querying the rest of the model, without
dedicated tables.

### Users and Access

`user` · `role` · `permission` · `role_permission` · `user_status` ·
`user_preference` · `user_session` · `password_recovery`

### Catalog

`activity` · `category` · `activity_category` · `category_status` ·
`activity_place`

### Location

`place` · `department` · `city` · `country`

### Plans

`plan` · `plan_detail` · `plan_status` · `plan_request` ·
`plan_request_category` · `request_status` · `outing_type`

### Feedback

`feedback` · `feedback_status` · `rating`

### Collections and Favorites

`collection` · `favorite_collection` · `favorite_list` · `favorite_activity` ·
`favorite_plan`

### External Integration

`external_provider` · `external_sync`

### System

`notification` · `system_parameter` · `audit_log`

They are implemented in `SmartPlan-back` under `src/<module>/entities/*.entity.ts`.
Read each entity for its attributes: each one documents what it represents and
which use case uses it.

### Key Model Details

Three decisions cannot be inferred from names alone:

1. **`rating` belongs to `activity`.** The traceability matrix, CU44, and PAN 18
   establish that each activity is rated; feedback may group multiple ratings
   from one experience.
2. **Every `plan` has `id_user`.** Generated plans also retain
   `id_plan_request`; for manually created plans (CU24), that relationship is
   null, but they never lack an owner.
3. **Coordinates are on `activity_place`, not `place`.** The meeting point
   depends on the activity: a winery entrance is not the tasting area.

> Appendix No. 5 has one class whose name is illegible in the PDF export: the
> catalog referenced by `plan_request.id_outing_type`. It is implemented as
> `outing_type`.

## Use Cases

62 use cases grouped into 10 modules.

### Authentication and Access Control

| CU  | Description       |
| --- | ----------------- |
| CU1 | Log in            |
| CU2 | Register user     |
| CU3 | Recover password  |
| CU4 | Log out           |

### User Management

| CU  | Description        |
| --- | ------------------ |
| CU5 | Edit profile       |
| CU6 | Change password    |
| CU7 | Delete account     |
| CU8 | Edit preferences   |

### Search and Discovery

| CU   | Description                    |
| ---- | ------------------------------ |
| CU9  | Search activities              |
| CU10 | Filter results                 |
| CU11 | Sort results                   |
| CU12 | Search plans                   |
| CU13 | View plan                      |
| CU14 | View activity                  |
| CU15 | Save activity                  |
| CU16 | View activities on a map       |

### Recommendation

| CU   | Description                                  |
| ---- | -------------------------------------------- |
| CU17 | Generate automatic plan                      |
| CU18 | Customize user preferences                   |
| CU19 | Generate surprise plan                       |
| CU20 | Show recommendations                         |
| CU21 | Adjust recommendations based on history      |
| CU22 | Select plan                                  |
| CU23 | Submit plan feedback                         |

### Planning

| CU   | Description              |
| ---- | ------------------------ |
| CU24 | Create plan              |
| CU25 | Edit plan                |
| CU26 | Delete plan              |
| CU27 | Add activity to plan     |
| CU28 | Remove activity from plan |
| CU29 | View plan                |
| CU30 | Calculate plan cost      |
| CU31 | Generate suggested plan  |

### Collections

| CU   | Description                    |
| ---- | ------------------------------ |
| CU32 | Create collection              |
| CU33 | Edit collection                |
| CU34 | Delete collection              |
| CU35 | Add activity to collection     |
| CU36 | Remove activity from collection |
| CU37 | View collection details        |
| CU38 | View collection                |

### Favorites

| CU   | Description                |
| ---- | -------------------------- |
| CU39 | View saved activities      |
| CU40 | View saved plans           |
| CU41 | Remove saved activity      |
| CU42 | Remove saved plan          |
| CU43 | Save favorite plan         |

### Ratings

| CU   | Description      |
| ---- | ---------------- |
| CU44 | Rate activity    |
| CU45 | View ratings     |
| CU46 | Edit rating      |
| CU47 | Delete rating    |

### External Integration

| CU   | Description                      |
| ---- | -------------------------------- |
| CU48 | Retrieve place data              |
| CU49 | Synchronize external information |
| CU50 | Update activity data             |
| CU51 | Record used external data        |
| CU52 | Retrieve external ratings        |

### Administration

| CU   | Description                    |
| ---- | ------------------------------ |
| CU53 | Manage activities              |
| CU54 | Manage categories              |
| CU55 | Moderate ratings               |
| CU56 | Delete content                 |
| CU57 | Manage users                   |
| CU58 | View system metrics            |
| CU59 | Review user suggestion         |
| CU60 | Manage plans                   |
| CU61 | Manage permissions             |
| CU62 | Manage roles                   |

## Screens

Screens are identified as `PAN NN`. The screens appearing in the traceability
matrix are:

| Screen                          | Associated use cases                                      |
| ------------------------------- | --------------------------------------------------------- |
| PAN 07 - Home                   | CU17                                                      |
| PAN 08 - Map Search             | CU16                                                      |
| PAN 09 - Surprise Me            | CU19                                                      |
| PAN 10 - Recommended Plans      | CU12, CU20                                                |
| PAN 11 - Search Results         | CU9, CU10, CU11, CU12, CU22, CU43                         |
| PAN 12 - View Favorites         | CU39, CU40, CU15, CU41, CU42, CU43                        |
| PAN 13 - View History           | CU23                                                      |
| PAN 14 - Edit Profile           | CU5, CU7                                                  |
| PAN 15 - Edit Preferences       | CU8                                                       |
| PAN 17 - View Plan              | CU13, CU22, CU23, CU25, CU26, CU27, CU28, CU29, CU30, CU43 |
| PAN 18 - View Activity          | CU14, CU35, CU15, CU44, CU45                              |
| PAN 19 - Manage Users           | CU57                                                      |
| PAN 20 - Moderate Ratings       | CU55                                                      |
| PAN 21 - Manage Activities      | CU53                                                      |
| PAN 22 - Manage Plans           | CU60                                                      |

The complete navigation map is in Appendix No. 7.

## Traceability

Each feature has the following chain:

```
Module -> CU (use case) -> US (user story) -> entities -> screen
```

Real examples from the matrix:

| Type       | Module             | Function                   | CU   | US   | Entities                                      | Screen        |
| ---------- | ------------------ | -------------------------- | ---- | ---- | --------------------------------------------- | ------------- |
| Functional | Business processes | Generate automatic plan    | CU17 | US16 | `plan_request`, `plan`, `plan_detail`         | PAN 07 - Home |
| Functional | Search and filtering | View activity            | CU14 | US14 | `activity`, `activity_place`, `place`         | PAN 18        |
| Functional | Collections        | Add activity to collection | CU35 | US30 | `favorite_collection`, `collection`, `activity` | PAN 18      |

**When implementing a feature, reference its CU in the commit and PR.** This
maintains the traceability required by the project documentation.

## Defined Reports

- **REP-01 - General Control Panel**: KPIs (total users, active plans, catalog
  activities, pending ratings), acceptance rate, average rating, retention,
  distribution by mood and group size, most popular activities, and recent
  activity.
- **REP-02 - User Administration**: header metrics (total, active today, new
  registrations), and a user table filterable by status (Active / Suspended /
  Banned).

## Glossary

| Term                 | Meaning                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| **Plan**             | Ordered set of activities that make up a social experience                                      |
| **Plan detail**      | Each item in a plan: an activity with its schedule and estimated cost                           |
| **Plan request**     | Parameters a user submits to generate a plan (budget, area, time, outing type)                  |
| **Surprise plan**    | A plan generated without the user setting every parameter                                       |
| **Activity**         | A specific catalog experience (for example, "Wine Route in Lujan de Cuyo")                     |
| **Place**            | Physical location where an activity takes place                                                 |
| **Collection**       | A user-created grouping of activities                                                           |
| **Favorites list**   | Quick saving of activities and plans                                                            |
| **Feedback**         | Post-experience feedback that informs recommendations                                           |
