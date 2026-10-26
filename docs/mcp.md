# MCP server

`src/mcp` exposes a [Model Context Protocol](https://modelcontextprotocol.io)
server so external bots (Grok bots for now) can load catalog activities, plans,
and photos. It uses the official SDK (`@modelcontextprotocol/sdk`) with the
**stateless Streamable HTTP** transport, mounted in the Nest app.

| | |
| --- | --- |
| URL | `POST {API_URL}/api/mcp` (e.g. `http://localhost:3001/api/mcp`) |
| Auth | `X-MCP-Key: smp_mcp_...` (or `Authorization: Bearer smp_mcp_...`) |
| Transport | Streamable HTTP, stateless, JSON responses. `GET`/`DELETE` answer 405 |
| Body limit | The API's JSON limit (100 KB): at most 100 items per bulk call |

## API keys

Only administrators (user JWT, role `admin`) manage keys and can inspect the tools:

| Method | Route | Result |
| --- | --- | --- |
| `POST` | `/api/admin/mcp-keys` `{ "name": "Grok bot" }` | `201` with `key`, **shown only once** |
| `GET` | `/api/admin/mcp-keys` | Keys without key or hash (`prefix`, `active`, `lastUsedAt`, ...) |
| `DELETE` | `/api/admin/mcp-keys/:id` | `204`; the key stops working immediately |
| `GET` | `/api/admin/mcp-tools` | `[{ name, description, inputSchema }]`, JSON Schema taken from a live `tools/list` |

The table `mcp_key` stores only the SHA-256 hash of each key (256-bit random,
so a fast hash is enough and allows an indexed lookup). Every accepted request
updates `last_used_at`. A missing, unknown, or revoked key gets `401`.

## Connecting a client

Any MCP client with Streamable HTTP and custom headers works, e.g.:

```json
{
  "mcpServers": {
    "smartplan": {
      "url": "https://api.example.com/api/mcp",
      "headers": { "X-MCP-Key": "smp_mcp_..." }
    }
  }
}
```

Raw JSON-RPC check:

```bash
curl -s http://localhost:3001/api/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "X-MCP-Key: $MCP_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Tools

Every tool answers a JSON text block; bulk tools return
`{ summary, results[] }` with one result per item (`index`, `status`,
`errors[]`). An invalid item never stops the others.

### `list_allowed_values`

No input. Reads from the database: active categories, outing types, loadable
plan statuses, and known geography (country/city/department). Also lists the
code-defined vocabularies the catalog import validates (activity types, price
kinds/units/sources, licence classes).

### `create_image_upload`

| Field | Type | Required | Values |
| --- | --- | --- | --- |
| `contentType` | string | yes | `image/jpeg`, `image/png`, `image/webp` |
| `byteSize` | integer | yes | 1 - 5242880 (exact size of the file) |

Returns `{ objectKey, uploadUrl, method: "PUT", headers, expiresAt }`. `PUT`
the bytes to `uploadUrl` (valid 15 minutes) with the given `Content-Type` and
a body of exactly `byteSize` bytes (`Content-Length` is signed). Do not add
`x-amz-checksum-*` headers: the URL is signed without checksums,
then reference `objectKey` in the `images` of an activity or a plan. The object
lands in the project's private bucket under `staging/mcp/`. External photo
links are not accepted.

### Galleries (`images` in activities and plans)

```json
"images": [
  { "objectKey": "staging/mcp/<uuid>", "isCover": true },
  { "objectKey": "staging/mcp/<uuid>" }
]
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `images` | array, 1-10, ordered | no | Order becomes `display_order` (0, 1, ...) |
| `images[].objectKey` | string | yes | From `create_image_upload`; each key once |
| `images[].isCover` | boolean | no | At most one `true`; it becomes `is_primary`. None => the first image is the cover |

Rules:

- `images` sent => it **replaces** the whole gallery (`activity_image` or
  `plan_image`) with exactly these images, in this order. Omitted => the
  existing photos are not touched. An upsert cannot add to a gallery: send
  the full list.
- All-or-nothing: every staged object is validated and converted to WebP by
  `MediaService` (same checks as an admin upload: JPEG/PNG/WebP, 5 MB) before
  the gallery changes. If one fails, the previous gallery is kept, the
  activity or plan data is still saved, and `images.status` is `error` with
  the failing `objectKey`s.
- Replaced rows are soft-deleted, like `DELETE /api/media/...`. Staged
  originals are deleted after a successful replace. No new tables: the bucket
  key is stored in the existing gallery tables.
- Result: `images: { status: "replaced" | "error", images: [{ id, url,
  isPrimary, displayOrder, createdAt }], errors: [{ objectKey?, error }] }`.
  Not run on `dryRun` or when the item itself failed.

### `upsert_activity` / `upsert_activities_bulk`

Each activity is one Google Maps place. **Key: `googlePlaceId`**, matched
against `place.google_place_id`: the activity already linked to that place is
updated, otherwise one is created. Records are converted into a catalog package
and run through `CatalogImportService` (validation, taxonomy, dedupe, source
links with source `mcp`, change log, and eligibility).

`upsert_activity`: `{ activity, licenseClass?, dryRun? }`;
`upsert_activities_bulk`: `{ activities: [...] (1-100), licenseClass?, dryRun? }`.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `googlePlaceId` | string | yes | Upsert key |
| `name` | string 3-150 | yes | |
| `description` | string 1-5000 | yes | |
| `durationMinutes` | integer 1-525600 | yes | |
| `categories` | string[] (>=1) | yes | Active category names (`list_allowed_values`) |
| `type` | string | no | Activity type from `list_allowed_values` |
| `price` | object | no | `{ kind, min?, max?, unit?, source?, sourceRef?, verifiedAt? }`; `kind` FREE/FIXED/FROM/RANGE/UNKNOWN; priced needs `source` OFFICIAL or CURATED |
| `verifiedAt` | ISO date | no | |
| `availableMonths` | integer[] 1-12 | no | Seasonal activities |
| `slug` | string | no | Only to create a new one or pick one when a place has several activities |
| `place` | object | when the place is new | `{ name, address, country, city, department, latitude?, longitude?, kind?, description? }`; geography must exist |
| `images` | gallery (see above) | no | Replaces the activity gallery when sent |

`licenseClass`: `OWNED` (default), `OPEN_ATTRIB`, `PROVIDER_ID_ONLY`.
`dryRun: true` validates without writing. Result `status`: `created`,
`updated`, `unchanged`, `needs_review`, `would_create`, `would_update`, or
`error`, with `activityId`, `slug`, and the gallery result.

Example:

```json
{
  "activity": {
    "googlePlaceId": "ChIJN1t_tDeuEmsRUsoyG83frY4",
    "name": "Degustación en Bodega Ejemplo",
    "description": "Visita guiada y degustación de tres vinos.",
    "durationMinutes": 90,
    "categories": ["Gastronomía"],
    "price": { "kind": "FIXED", "min": 15000, "unit": "PER_PERSON", "source": "OFFICIAL", "sourceRef": "https://bodega.example/visitas" },
    "place": { "name": "Bodega Ejemplo", "address": "Ruta 15 km 30", "country": "Argentina", "city": "Mendoza", "department": "Luján de Cuyo" },
    "images": [{ "objectKey": "staging/mcp/2f1c...", "isCover": true }]
  }
}
```

### `upsert_plan` / `upsert_plans_bulk`

`upsert_plan`: `{ plan, dryRun? }`; `upsert_plans_bulk`: `{ plans: [...] (1-100), dryRun? }`.
**Key: `sourceId`.** It is turned into a deterministic
`composer_request_id`, so reloading the same `sourceId` updates the plan
(title, people, visibility, status, and the ordered itinerary) through the plan
composer instead of duplicating it. Plans belong to `MCP_OWNER_USER_ID` or,
if unset, the first administrator; with neither, every plan fails with
`MCP_OWNER_NOT_AVAILABLE`. Each plan is its own transaction.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `sourceId` | string 1-200 | yes | Upsert key |
| `title` | string 1-150 | yes | |
| `description` | string <=2000 | no | |
| `peopleCount` | integer 1-1000 | yes | Totals and cost per person derive from it |
| `status` | string | no | `confirmed` (default), `completed`, `cancelled` |
| `visibility` | string | no | `private` (default, draft) or `public` |
| `activities` | array (1-50), ordered | yes | Each `{ activityId }` or `{ googlePlaceId }`; order becomes `plan_detail.order` |
| `images` | gallery (see above) | no | Replaces the plan gallery (`plan_image`) when sent |

Activities must be published and plan-eligible. A cancelled plan cannot be
public. The result carries `planId`, `planStatus`, `visibility`, the cost, and
the gallery result when `images` was sent.

Cost fields:

| Field | Meaning |
| --- | --- |
| `estimatedTotalCost` | Group total of the priced activities. With `UNKNOWN`/unpriced activities it is the known part (e.g. 0 when the rest is `FREE`): check `priceCompleteness`. `null` only when nothing is priced (`NONE`). For `FROM` prices it is the lower bound |
| `estimatedCostPerPerson` | `estimatedTotalCost / peopleCount`, `null` only when the total is `null` |
| `priceCompleteness` | `EXACT`, `RANGE`, `LOWER_BOUND`, `PARTIAL` (some unpriced), `NONE` (nothing priced) |
| `unpricedCount` | Activities without a price |

These are the same totals the web shows (`PARTIAL` as "$X + N sin precio").

`dryRun: true` runs the same validation (schema, activity resolution, duplicate
stops, activities published and plan-eligible, cancelled + public, image
references are staged uploads) and returns `would_create` / `would_update`
with the cost it would compute. It writes nothing, does not change the status,
and does not touch the gallery (staged images are not downloaded, so a corrupt
file is only detected on the real load).

```json
{
  "plan": {
    "sourceId": "grok-plan-0001",
    "title": "Tarde de vinos en Luján",
    "peopleCount": 2,
    "visibility": "private",
    "activities": [{ "googlePlaceId": "ChIJN1t_tDeuEmsRUsoyG83frY4" }, { "activityId": 42 }],
    "images": [{ "objectKey": "staging/mcp/9a0b..." }, { "objectKey": "staging/mcp/7c1d...", "isCover": true }]
  }
}
```

Bulk tools declare their items as generic objects on purpose: each item is
validated by the service with the single-item schema, so one invalid item is
reported as an error instead of rejecting the whole call.
