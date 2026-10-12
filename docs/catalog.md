# Catalog platform

How SmartPlan builds, validates and promotes its activity/place catalog, and
the rules that keep it honest. The code is the source of truth; this page
explains the decisions behind it.

## Principles

1. **SmartPlan owns the catalog.** Providers are sources, never the source of
   truth.
2. **Unknown is not free.** A missing price is `UNKNOWN`. `FREE` needs positive
   evidence. `UNKNOWN` never becomes `$0` anywhere (storage, filters, totals,
   prompts, UI).
3. **Publication is not recommendation safety.** What may be *shown*, what may
   be *planned* and what may be *recommended automatically* are separate.
4. **Provider content stays inside provider terms.** Only the Google Place ID is
   persisted. Everything else Google returns is a temporary cache with an
   expiry, and never part of the canonical catalog or any version package.
5. **Do not manufacture Activities from Places.** An Activity is created only
   when someone confirms it is something a person can do.

## Data model

| Table | Purpose |
| --- | --- |
| `place` | A physical location. SmartPlan-owned `latitude/longitude`, `slug`, `status`, `kind`, `discoverable`, `verified_at`, `canonical_key`. |
| `activity` | Something to do. Adds `slug`, `status`, eligibility flags and structured price columns. |
| `activity_place` | Links an activity to a place. Carries the Google Place ID, and the temporary Google cache (`coordinates_source`, `external_*`). |
| `entity_source_link` | Which external identity a canonical row corresponds to, with its licence class. A Google `place_id` is `PROVIDER_ID_ONLY`. |
| `catalog_import_batch` | One import run: source, licence class, dry-run flag, input hash, stats. |
| `catalog_staging_record` | Every record of a batch after validation, with its outcome and notes. |
| `catalog_change_log` | What a batch did to a canonical row (allow-listed before/after). |
| `catalog_version` | A content-hashed catalog state that can be promoted between environments. |

### Price

`activity.price_kind` is `FREE | FIXED | FROM | RANGE | UNKNOWN`, with
`price_min/max`, `price_unit` (`PER_PERSON`, `PER_GROUP`, `ENTRY`,
`CONSUMPTION`, `UNSPECIFIED`), `price_source` (`OFFICIAL`, `CURATED`,
`USER_REPORTED`, `PROVIDER_HINT`, `LEGACY`), `price_source_ref` and
`price_verified_at`. Database CHECK constraints enforce the shape of every
kind. `estimated_cost` is kept as the legacy lower bound and is `NULL` when the
price is unknown.

Confidence order: `OFFICIAL` → `CURATED` → `USER_REPORTED` → provider hint →
`UNKNOWN`. Google `priceLevel`/`priceRange` are never converted to ARS.

A plan detail **snapshots** the price when an activity enters a plan, so later
edits to the activity never change a saved plan. Plan totals are a range with a
completeness flag (`EXACT`, `RANGE`, `LOWER_BOUND`, `PARTIAL`, `NONE`) and an
`unpricedCount`; per-person amounts are multiplied by the party size.

### Legacy data

Migration `AddPriceModel` backfills a positive legacy amount as
`FIXED/UNSPECIFIED/LEGACY` (low confidence, it was always added as-is) and a
stored `0` as `UNKNOWN`: zero was also the only way to say "no price" and there
is no evidence it was free. **Review legacy zero-priced activities and mark the
genuinely free ones as `FREE` with a source.**

## Eligibility

Computed by `src/catalog/eligibility.ts` (pure, unit-tested) and stored on
`activity`:

| Flag | Meaning | Main requirements |
| --- | --- | --- |
| `discoverable` | May appear in exploration, search, map | published; a name and a real description (no place or category required: an at-home activity is legitimate) |
| `plan_eligible` | May be added to a plan | discoverable; duration > 0. An `UNKNOWN` price is allowed (shown as unpriced) |
| `auto_recommend_eligible` | May be picked automatically (generation, suggestions, assistant) | plan eligible; known price at or above `CATALOG_AUTO_RECOMMEND_MIN_PRICE_CONFIDENCE`; curated/official price verified within 90 days; an active category; coordinates |

`eligibility_reasons` lists why a flag is false. Flags are recomputed on admin
create/update, after an import, and by `catalog eligibility` (run it
periodically so a stale price stops being recommended).

Public queries filter on them: exploration/map on `published + discoverable`,
adding to a plan on `plan_eligible`, automatic generation, suggestions and the
assistant's suggestions on `auto_recommend_eligible`. Stops a plan already has
are never removed because an activity later stopped being eligible.

## Google Maps Platform boundary

- **Persisted:** the Place ID only.
- **Temporary cache:** coordinates and rating the sync fetches live in
  `activity_place` with `coordinates_source = GOOGLE_CACHE` and
  `external_expires_at` (at most `GOOGLE_CACHE_TTL_DAYS` ≤ 30). Expired values
  are purged by the sync worker and never served (`visibleExternalRating`).
- **Never overwritten:** SmartPlan-owned (`OWNED`) coordinates are never
  replaced or nulled by Google data.
- **Never exported:** `catalog export` reads `place` coordinates only.
- **Photos:** photo resource names are never persisted or cached; photos are
  fetched live and are not copied to our bucket.
  `GET /api/external-integration/places/:placeId/photo-attribution` returns the
  author credit that must be shown, and `.../photo` redirects (302, no-store)
  to a short-lived Google URI. Each billed photo is recorded and counted
  against the monthly budget; the kill switch applies. The front renders it
  with `GooglePlacePhoto`, always crediting the author and "Google Maps".
- **Allow-list:** staging payloads, packages and the change log are validated
  against an allow-list; a package containing a restricted provider field
  (`rating`, `photos`, `formattedAddress`, `regularOpeningHours`, ...) is
  rejected before anything is written.
- **Cost guard:** `GOOGLE_PLACES_ENABLED` kill switch,
  `GOOGLE_MAX_REQUESTS_PER_SECOND`, a monthly budget
  (`GOOGLE_CATALOG_MONTHLY_BUDGET_USD`, default 25) that stops the sync pass,
  and `catalog google-estimate` to estimate a pass without calling Google.

OpenStreetMap/ODbL data is **quarantined**: an import whose licence class is
`ODBL` is refused until a database-licence decision is made.

## Pipeline

```
curated CSV / JSON package ─► validate ─► dedupe ─► stage ─► (dry run report)
                                                          └► apply ─► eligibility ─► version
```

Import is idempotent, keyed by `slug`: a second run reports `unchanged` and
changes nothing. A probable duplicate (same Place ID, or similar name within
150 m, or the same name in the same department with no position) is flagged
`needs_review` and not created unless `--accept-duplicates` is passed after a
human review.

### Commands

```bash
pnpm catalog csv-to-package places.csv activities.csv package.json --source curated-csv
pnpm catalog import package.json --dry-run
pnpm catalog import package.json --confirm <database-name>
pnpm catalog export catalog-v1.json --name "Mendoza v1"
pnpm catalog verify catalog-v1.json
pnpm catalog report
pnpm catalog eligibility
pnpm catalog google-estimate
```

`catalog eligibility` also runs nightly (04:30) from the API process, so a
price that went stale or a cache that expired is re-judged without a manual run.

CSV templates are in `docs/catalog/templates/`. A non-dry-run import requires
`--confirm <database-name>`: it must match the database the process is
connected to, which is the guard against promoting into the wrong environment.

## Staging → production

Staging and production keep **separate databases**. What moves is a version
package:

1. Build and review the catalog; `catalog export` writes the package and a
   `catalog_version` row with the content hash.
2. `catalog verify` on the package, then `catalog import --dry-run` against
   staging; review the diff; import with `--confirm`.
3. Run `catalog report` and the smoke checks on staging.
4. Import the **same file** into production (`--confirm` the production
   database). The manifest hash is re-checked: a modified package is refused.
5. Rollback: re-import the previous version's package with `--archive-missing`.
   `catalog_change_log` keeps before/after for each canonical change.

## Quality

`catalog report` prints the measurable state: published/discoverable places,
coordinate and description coverage, activities by eligibility flag, price
known/free/unknown percentages, stale prices, verification recency, coverage by
department and category, duplicate key groups and the state of the Google
cache (non-expiring cached rows must be 0).
