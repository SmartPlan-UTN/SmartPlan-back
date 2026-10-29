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

## Additions since the first platform release

### Publication of identified places

A place is published when it has SmartPlan-owned coordinates **or** a reviewed
Google Place ID (its position is then resolved from the temporary Google cache
at runtime). A place with neither waits in `in_review`. An activity whose
places are all unpublished is not discoverable (`place_not_published`).

### Google: price context, on-demand refresh, matching

* `activity_place` caches the place-level `priceRange`/`priceLevel` next to the
  rating (same expiry). It is exposed as `externalPrice` and rendered as
  "Referencia del lugar en Google Maps", never as the activity price.
* `PlaceRefreshService` refreshes an expired or empty cache when somebody opens
  an activity, at most 3 places per request, with the shared monthly budget,
  the kill switch and a 15-minute retry window. The nightly sync uses the same
  cache rules (`google-cache.ts`).
* All paid paths (`external-sync`, `catalog-match`, `place-refresh`) count
  against `GOOGLE_CATALOG_MONTHLY_BUDGET_USD`.
* New CLI commands:
  `catalog google-match <package> --out <matches.json> [--source-contains a,b]`
  (identity matching; results stay in a local file),
  `catalog apply-matches <package> <matches.json> <out> [--drop-unmatched]
  [--drop-ambiguous]` (only Place IDs flow back; CLOSED listings with a real
  review history are dropped) and `catalog google-cache-seed <matches.json>`
  (loads already-paid results into the temporary cache).

### Fail-closed catalog writes

Every writing command (`import`, `export`, `eligibility`, `google-match`,
`google-cache-seed`) prints the effective host/database first. A local host is
accepted only for the approved database (`CATALOG_LOCAL_DATABASE`, default
`smartplan_mendoza`); any other host needs `--environment staging|production`
**and** `--allow-remote <exact host>`. Remote connections never run migrations
or schema synchronisation from the CLI.

### Bootstrap price age

`CATALOG_AUTO_RECOMMEND_MAX_PRICE_AGE_DAYS` (default 90) is the oldest verified
price automatic recommendation accepts. A bootstrap catalog may raise it per
environment; people still see prices older than 90 days labelled as reference
prices with their month.

### Observed prices (the SmartPlan feedback loop, v1)

Feedback accepts `activityCosts: [{activityId, amount}]` (what the person's
party paid for one activity). They are stored in `activity_price_observation`,
apart from the plan-level `actualCost`, which is never split across
activities. The estimate is a recency-weighted robust range (half-life 45
days, 180-day look-back, MAD outlier filter, at least 3 reports, rounded to
ARS 500). It replaces an activity price only when nothing current and
official/curated exists; the replaced price is kept in `activity_price_history`.
Packages never carry user-reported evidence (exported as `UNKNOWN`), and
importing an `UNKNOWN` never wipes an environment's own estimate.

### Mendoza v1 workflow

```bash
export DATABASE_URL=postgresql://postgres:root@localhost:5432/smartplan_mendoza DB_SSL=false NODE_ENV=development
bash catalog-data/mendoza-v1/run.sh build        # builder -> CSV -> package
bash catalog-data/mendoza-v1/run.sh match --source-contains enoturismo   # paid
bash catalog-data/mendoza-v1/run.sh reconcile    # apply matches, harvest IDs, rebuild
bash catalog-data/mendoza-v1/run.sh import       # local import + cache seed + eligibility
pnpm catalog export catalog-data/mendoza-v1/release/mendoza-v1.json --name "Mendoza v1"
```

Sources, licences, price caveats and the measured quality report are in
`catalog-data/mendoza-v1/SOURCES.md` and `QUALITY-REPORT.md`.

The current offline release is checked on Windows with:

```powershell
node catalog-data/mendoza-v1/verify-local-release.cjs
# Optional local write proof: refuses any target except localhost/smartplan_mendoza.
node catalog-data/mendoza-v1/verify-local-release.cjs --import-local
```

This rebuilds twice, compares package bytes, validates provenance/identities and
scans for restricted provider fields. The local import proof requires every
canonical row to remain unchanged on the second import. `.local/` evidence is
ignored; versioned QUALITY-REPORT, SEARCH-QA and PRODUCT-QA describe release
measurements and remaining gates. Matching/reconciliation commands can contact
providers and are separate from the offline reproducibility check.

## Expanded catalog: occasions, the Hogar and the review queue (#135, RF43, RF44, CU49-CU51)

### Occasions

`OCCASIONS` in `src/catalog/taxonomy.ts` is a third vocabulary, separate from
place kinds and activity subtypes, stored in `activity.occasions` (`text[]`,
vocabulary CHECK, GIN index):

| Group | Keys | How generation uses them |
|---|---|---|
| who | romantic, friends, family, kids, solo, big_group | hard filter: an activity must carry **every** who-occasion the request names |
| mood | quiet, party, outdoor, indoor, adventure, special | ranking; a clashing occasion (`conflictsWith`) excludes an activity only when it has none of the requested ones |

"De día / de noche" stay in `available_times_of_day` and "económico" in the
price. An activity without occasions is published but never
auto-recommended (`no_occasions`).

### The Hogar

A single virtual place (`kind = 'home'`, slug `hogar`, "En casa / donde
estén") with no department, coordinates or Google identity (CHECKs and a
unique partial index). Its games and free plans come from
`catalog-data/hogar-v1/` (source `smartplan-hogar`). Rules:

- Eligibility treats it as located and open. A curated FREE price with a
  rules source on an activity only at the Hogar never goes stale.
- Lists, maps, Explore places, Google sync and matching, dedupe and
  self-guided visits skip it. API locations mark it `atHome: true` with a
  null department; a plan request gives it the starting point as its
  coordinates and never filters it by distance. Travel to and from it is 0.

### Package v2

`CATALOG_PACKAGE_SCHEMA_VERSION = 2`: activities may carry `occasions`,
`minPeople`, `maxPeople`, `minAge`, `materials`, `rulesRef` and
`availableTimesOfDay`; a place may be the Hogar (no geography). v1 still
imports, and a field a record does not carry keeps its current value, so
re-importing an older package never erases occasions tagged later. Export
writes v2 fields only when set.

### Places without activities are hidden

A published place shows in `GET /places`, `GET /places/:id`, Explore
(`itemType=PLACE`) and the map only while it has an approved activity of
its own (`src/catalog/visibility.sql.ts`); a self-guided visit (#146)
does not count, and a hidden place gets no new visit. It is never deleted:
`catalog report` lists it in `places.withoutApprovedActivitiesSlugs`.
Administration lists every place through `GET /api/admin/places`.

### Review queue

`catalog_candidate` holds proposed activities and places
(`initial_load`, `monthly_refresh`, `manual`) in the package v2 shape.
Approving runs `CatalogImportService` (validation, dedupe, eligibility,
change log); a possible duplicate answers 409 until approved with
`force`. The fingerprint (type, place, normalised name) is unique in every
status, so a discarded proposal never returns. Endpoints:
`docs/administration-api.md`. CLI:

    pnpm catalog candidates:load <file.json> --origin initial_load --confirm <db>
    pnpm catalog candidates:export <out.json> [--status approved]

### Monthly refresh vs. the daily sync

The daily 03:00 Google sync is unchanged: Google allows caching its data
for at most 30 days, so a monthly refresh alone would let it expire. The
monthly run (1st at 05:00 Mendoza, `CATALOG_REFRESH_SCHEDULER_ENABLED`,
one completed run per `period`) recomputes eligibility, counts closed
places, stale prices and places without activities and, with
`CATALOG_DISCOVERY_ENABLED`, asks Gemini for candidates: activities for
places without any, seasonal activities and new places in the known gaps.
Everything goes to the queue; nothing is published. Each source page is
checked (`source_unverified` otherwise) and a price without a dated
source is UNKNOWN. Caps per run: `CATALOG_DISCOVERY_MAX_GEMINI_CALLS_PER_RUN`
(60), `CATALOG_DISCOVERY_MAX_CANDIDATES_PER_RUN` (200),
`CATALOG_DISCOVERY_MAX_PLACES_PER_RUN` (40). A failing step is recorded in
`external_sync.details` and not retried; every call is an
`external_data_usage` row with context `catalog-discovery` (CU51).
Locally, without RabbitMQ:

    pnpm catalog refresh --confirm smartplan_mendoza [--period YYYY-MM] [--skip-discovery]

### Promotion (documented only; not part of #210)

1. From the reviewed local database: `pnpm catalog export mendoza-v2.json
   --name mendoza-v2` (the Hogar travels in `hogar-v1/data/package.json`).
2. `pnpm catalog verify` on both packages.
3. `pnpm catalog import <pkg> --dry-run --environment staging --allow-remote <host>`
   and review the report. The deploy must have run migration
   `1792600000000-AddCatalogOccasionsHomeAndCandidates` first.
4. `pnpm catalog import <pkg> --confirm <db> --environment staging --allow-remote <host>`.
5. `pnpm catalog eligibility` and `catalog report`. Turn on
   `CATALOG_REFRESH_SCHEDULER_ENABLED` and `CATALOG_DISCOVERY_ENABLED` only
   after validating. Production: the same, with its own approval.
