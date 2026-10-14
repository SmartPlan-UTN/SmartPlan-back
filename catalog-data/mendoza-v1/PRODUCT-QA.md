# Mendoza Catalog v1 — local product evidence (2026-10-14)

## Integrated surfaces

Frontend `feature/136-fotos-de-lugares` (head `303b8c2`, photo implementation
`25e6995`) is integrated locally with the current catalog contracts. Its image
download/attribution renderer, recommendation/outing/hero fallbacks and filter
restoration remain. Backend compatibility uses the photo contract from PR #116
with Place-owned identity and the catalog's stricter quota guards.

Explore uses compact 16:10 photo frames, 22px / weight 800 titles and quieter
location/type metadata. It no longer duplicates the provider's business heading,
Maps button and empty reserved area ahead of the real title. Author links and
Google Maps or Commons licence credits remain visible and outside the detail link.
Photos load near the viewport; a failed/exhausted provider keeps the artwork.
Three first-row cards measured 417px both before and after photos loaded.

## Browser checks

Actual CSS widths measured in Chrome: 1440, 1308, 1100, 769 and 360px. All had
`document.documentElement.scrollWidth <= innerWidth`. Production was served on
localhost:3010; the API used localhost:3001 and the approved local database.
Ignored captures are in the frontend's `screenshots/catalog-20261014/` folder.

- First viewport and long scroll show real venue/open-licensed photos and readable
  titles. Google/Commons author links remain separate interactive controls.
- Keyboard Enter executes search; an impossible query renders the explicit empty
  state. A minimum greater than the maximum announces an error and pauses search;
  the controls recover after keyboard activation of Clear.
- `degustación` returns 14 real activities, including honest UNKNOWN Lagarde
  prices. The tasting subtype selects eight activities and reaches the map with
  `type=tasting&itemType=ACTIVITY`.
- Fixed the map's invalid page size (300 versus the API's maximum 100), framed
  filtered points beyond downtown and retained an open marker when auto-pan
  returns the same marker set. Real markers include López, Norton, Lagarde and
  Andeluna. Marker context links to the corresponding activity.
- Activity detail shows real duration, reservation restrictions, attributable
  photo and persistent meeting point. Place detail does not manufacture an
  addable product. Unrated plan/itinerary items render “Sin reseñas”.
- Manual composer: a private two-person plan with Anna brunch and Parque General
  San Martín was reviewed and saved. Its group total is ARS 49,600; per person
  ARS 24,800, with the free park preserved as FREE. Quick View does not add a stop
  until the user selects its add action. Tablet route/review retained the totals.
- A disposable outing was completed; mobile feedback accepted total spend and
  party size plus one explicitly entered activity expense. The other activity
  stayed blank: no automatic allocation. The simulated observation was then
  soft-retired so it cannot train actual catalog estimates.

## Live generation

Requests used a dedicated local QA account and the real running pipeline.

| Budget | Result |
|---|---|
| ARS 0 | Three free city-park/plaza alternatives |
| ARS 60,000, two people | Four Anna merienda + city-walk alternatives; ARS 17,600 group total, exact prices |
| ARS 200,000, two people, Maipú | Five wine/culture alternatives; known minima ARS 35,000–177,000, UNKNOWN museum admissions correctly make totals PARTIAL or NONE |

All inspected activity locations had persistent coordinates. A new search no
longer inherits an inferred zero budget from the preceding sentence. The ordinary
90-day freshness rule now controls the automatic priced core (41 activities).
Old manual reference prices are explicitly qualified; confidence alone is not
misrepresented as user-reported spending.

## Automated and release evidence

- Frontend final full suite: 135 files / 921 tests passed, including photo,
  price-source and unrated-plan regressions. Lint, TypeScript and production
  build pass; final full-run logs are retained locally.
- Backend: 87 unit suites / 798 tests passed, five opt-in spike tests skipped.
  Four current integration suites (photos, plans, recommendations, outings):
  50 tests passed against isolated local PostgreSQL. Earlier catalog and
  generation/composer/feedback integration passes remain in local evidence.
- A real PostgreSQL transaction test grants only one of two concurrent callers
  the final photo quota slot. Reservations fail closed before a billed URI call.
- All 22 migrations applied to an isolated migration database; latest down/up
  passed. No schema change was introduced by the photo compatibility adapter.
- Offline package rebuild is byte-identical. Second local import reports 583
  Places and 74 Activities unchanged. SHA-256 is in QUALITY-REPORT.md.

## Limits and staging

This is local evidence, not a declaration that every catalog source is complete.
Discoverable Place permanent-coordinate coverage is 68%; six search intents
remain weak. UNKNOWN/adventure meeting-point gaps are not filled with invented
products. Reduced-motion CSS was inspected (hover transforms/transitions and
skeleton animation are disabled); OS preference switching was not exercised by
the browser capability. Provider invoice/billing-account reconciliation has not
been verified. No staging/production write, push or deployment occurred.

`prepare-staging-local.cjs` prepares the package and an ignored snapshot of 136
current, corroborated Place caches. It keeps original fetched/expiry timestamps,
excludes photo files, credentials, feedback and canonical-coordinate writes, and
includes monthly usage totals for quota reconciliation. The intended Railway
environment/service must be identified before a remote import. Backend schema
and deployed API compatibility, backup, dry-run and shared provider usage must
be verified there; copying a cache must never restart its 30-day clock or reset
a shared Google billing allowance.
