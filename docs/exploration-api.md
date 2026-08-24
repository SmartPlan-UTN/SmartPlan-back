# Search and exploration contract

HTTP contract implemented for CU9-CU14 and CU16. All routes use the global
`/api` prefix, technical names and responses are in English, and user-visible
error messages remain in Spanish.

## Endpoints

| Method | Route                 | Purpose                                       |
| ------ | --------------------- | --------------------------------------------- |
| `GET`  | `/api/activities`     | Search, filter, sort, and paginate activities |
| `GET`  | `/api/activities/map` | Get markers within a viewport                 |
| `GET`  | `/api/activities/:id` | Retrieve an activity's detail                 |
| `GET`  | `/api/plans`          | Search, filter, sort, and paginate plans      |
| `GET`  | `/api/plans/:id`      | Retrieve a plan and its ordered itinerary     |
| `GET`  | `/api/categories`     | List active categories for filters            |
| `GET`  | `/api/places`         | Search places and filter by department        |
| `GET`  | `/api/places/:id`     | Retrieve a place and its geographic hierarchy |

CU15 belongs to the favorites module. It is not part of these endpoints
because saving an activity requires authenticating the user and checking that
they own the favorites list.

## Querying activities

`GET /activities` accepts:

| Parameter                | Type      | Rule                                                            |
| ------------------------ | --------- | --------------------------------------------------------------- |
| `search`                 | string    | Free text, between 1 and 200 characters                         |
| `categoryIds`            | integer[] | IDs separated by comma or repeated parameters                   |
| `type`                   | string    | Exact technical key of `activity.type`, normalized to lowercase |
| `minPrice` / `maxPrice`  | decimal   | Non-negative values; the minimum does not exceed the maximum    |
| `minRating`              | decimal   | Between 1 and 5                                                 |
| `latitude` / `longitude` | decimal   | Origin for distance                                             |
| `maxDistanceKm`          | decimal   | Radius between 0.1 and 500 km                                   |
| `sortBy`                 | enum      | `relevance`, `price`, `rating`, or `distance`                   |
| `direction`              | enum      | `asc` or `desc`; applies to price                               |
| `page`                   | integer   | Starting from 1, default value 1                                |
| `limit`                  | integer   | Between 1 and 100, default value 20                             |

`activity.type` is nullable to allow progressive rollout. Existing activities
do not appear when using this filter until an import or an administrative
operation assigns them a technical key. The column's B-tree index is used
because the filter relies on equality, not content search.

## Querying plans

`GET /plans` accepts the same general parameters as activities, except
`type`. To filter by the outing type associated with `plan_request`, use:

| Parameter    | Type   | Rule                                         |
| ------------ | ------ | -------------------------------------------- |
| `outingType` | string | Matches the key or the name of `outing_type` |

Thus, `type` always represents `activity.type`, and `outingType` always
represents a plan's outing type.

Every plan, both in the listing and in the detail, carries `activityNames`:
the names of the itinerary's activities ordered by `plan_detail.order`. The
frontend renders that chain on the plan card ("Bodega -> Almuerzo ->
Degustacion") instead of a bare counter. `activityCount` is the length of that
array, so both fields skip soft-deleted activities: one removed from the
catalogue disappears from the chain and from the count alike.

Sorting by distance requires `latitude` and `longitude`. The radius filter
additionally requires `maxDistanceKm`. Distance is calculated in PostgreSQL
using Haversine over the coordinates of `activity_place`; it does not require
PostGIS.

Current relevance is textual and deterministic: exact match, prefix, and
content. AI-based semantic search belongs to the recommendation engine and
can replace that score without changing the HTTP contract.

All sort orders add `id` as a stable tiebreaker.

Inactive categories are not returned and do not participate in filters.
Average ratings are rounded to two decimals in listings and details.

## Querying categories

`GET /categories` accepts:

| Parameter   | Type    | Rule                                                       |
| ----------- | ------- | ---------------------------------------------------------- |
| `search`    | string  | Searches name and description, between 1 and 80 characters |
| `sortBy`    | enum    | `name`                                                     |
| `direction` | enum    | `asc` or `desc`                                            |
| `page`      | integer | Starting from 1, default value 1                           |
| `limit`     | integer | Between 1 and 100, default value 20                        |

Only active categories are returned. That is why the response does not
repeat a `status` field whose value would always be `active`.

## Querying places

`GET /places` accepts:

| Parameter      | Type    | Rule                                                                       |
| -------------- | ------- | -------------------------------------------------------------------------- |
| `search`       | string  | Searches name, address, department, and city; between 1 and 150 characters |
| `departmentId` | integer | Positive ID of the department                                              |
| `sortBy`       | enum    | `name`                                                                     |
| `direction`    | enum    | `asc` or `desc`                                                            |
| `page`         | integer | Starting from 1, default value 1                                           |
| `limit`        | integer | Between 1 and 100, default value 20                                        |

## Map view

`GET /api/activities/map` requires the bounds `south`, `north`, `west`, and
`east`. It also accepts the same activity filters. Each item in `data`
represents an `activity_place` location, not just an activity, because an
activity can have more than one meeting point.

## Paginated response

All listings respond with:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 0
  }
}
```

Plan exploration is a public projection of non-cancelled plans. It does not
include the owner, request criteria, user notes, email, password hash, or
other sensitive fields. Private plan management endpoints will need to be
added alongside authentication and authorization.

## Schema changes

The `AddActivityType` migration adds `activity.type` and its index. The
prior `CompleteSchemaEnglishTranslation` migration, merged from `develop`, is
responsible for renaming `rating.puntaje` to `rating.score`.
