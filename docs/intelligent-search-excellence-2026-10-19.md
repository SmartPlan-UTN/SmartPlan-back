# Intelligent Search: product evidence, 19 October 2026

This increment improves the existing engine and manual Creator. It does **not**
establish broad Mendoza decision readiness. Prices, hours, stock and contextual
fit remain separately assessable. No migration, deployment, purchase, reservation
or paid-provider enrichment was performed.

## Before and after

| Problem found | Implemented behavior |
| --- | --- |
| A specialty coffee request could become a plaza outing | Standalone café language selects merienda; pure ice-cream actions cannot satisfy it. Specialty coffee still needs venue evidence. |
| Ingredients could turn a main dish into a drink or side | Menu sections constrain semantic roles; milanesa with fries, Malbec beef and beer chicken remain mains. |
| Beer could be priced using wine; bottle portions were guessed | Beer requires beer. Wine needs a published glass or explicit shared serving; bottle size does not invent servings. |
| Freshness and chain navigation could contaminate a branch | Different location query parameters are rejected before fetching; only that source's previous facts expire. Worker refresh applies sibling identity checks too. |
| Known menu/hour data dominated a different requested atmosphere | Documented atmosphere outranks operational completeness; weak name/type priors are discounted. Expensive prices and the word “gourmet” alone do not prove premium style. |
| A generic request near 19:30 could become a dinner at 19:45 | Implicit activities are chosen for the first usable time, then aligned with that activity's own window. Explicit user times are preserved. |
| Manual Creator could only author Activity targets | Published direct-action places can be searched, explicitly added, saved, reopened and edited without creating Activities. |
| A map authentication failure could expose provider error UI | The shared map hook clears the failed provider surface and exposes the existing product fallback. |
| Spend divergence mixed coffee and meals or compared group prices incorrectly | Revalidation aggregates the same action, uses per-person amounts and supports group-priced estimates without rewriting official prices. Wrong-hour reports do not become six-month personal dislikes. |

## Actual Mendoza coverage

Local `smartplan_planning`: 1,800 published places, 1,701 with both coordinates;
174 in review, 29 located. Publication counts did not increase in this increment.
There are **six venue IDs with current menu observations**, representing Bony's,
two Don Mario venues, Fuente y Fonda and two ÑAM branches. Observation count rose
from 8 to 18 through refresh; this is **not** ten new menus or venues. Current
opening-hours coverage rose from 16 to 17 places.

Selected published/discoverable, located pools from the coverage report:

| Area | Dinner/lunch places | Current hours | Price evidence | Winery places / actual offerings |
| --- | ---: | ---: | ---: | ---: |
| Ciudad | 257 | 4 | 5 | 1 / 0 |
| Godoy Cruz | 52 | 0 | 0 | 2 / 0 |
| Guaymallén | 63 | 2 | 2 | 3 / 0 |
| Luján / Chacras | 86 | 1 | 0 | 38 / 3 |
| Maipú | 35 | 0 | 0 | 22 / 1 |
| Valle de Uco | 38 | 0 | 0 | 37 / 1 |
| San Rafael | 22 | 0 | 0 | 2 / 0 |

These are candidate pools, **not** executable recommendations. At the evaluation
time, the dinner funnel had 467 places, five confirmed open and four with price
evidence. The romantic ARS 80,000 request had zero proven within-budget anchors.
Merienda had 323 potential anchors, one confirmed open and zero priced anchors.
Drinks/beer had 82 anchors, zero confirmed open and one with price evidence.
Godoy Cruz's cheap-plan funnel had 55 anchors, zero confirmed open and zero priced.
Adventure had three offering candidates, one priced, none confirmed open.

Targeted acquisition processed 63 sources for 23 selected places: 36 successful,
11 hours refreshes, seven menu refreshes, 11 without facts, two network failures,
five timeouts, five robots denials, two policy denials and two unconfirmed
identities. These outcomes are source observations, not venue coverage totals.
An additional four-source ÑAM refresh withdrew obsolete descriptive claims and
refreshed two menu/hour projections. Reviewed source hints are committed as
discovery inputs; identity, robots and retention policy still apply.

## Reproducible product evaluation

The checked-in evaluator contains 41 varied requests, including all 15 acceptance
examples. Final offline run: **2026-10-19T22:26:34.686Z**, local catalog, no Google
or Gemini. The evaluator keeps its existing variety and Jaccard thresholds and
now also refuses FULL for unsubstantiated requested atmosphere.

Result: **8 FULL, 1 PARTIAL, 29 UNCERTAIN, 3 FAILED**. FULL includes two correct
refusals of unsupported strict budgets; it does not mean eight bookable outings.
The three failures are entertainment without food at this evening time and the
still excessive top-five overlap between friends and cheap dinners (Jaccard 0.43).
Premium overlap improved to 0.11 against friends and 0.00 against cheap meals.
These comparisons use the same catalog and timestamp for the final ranking pass.
Earlier aggregate runs at different times are not before/after success rates.

| Request | Actual best response | Evidence limit |
| --- | --- | --- |
| Fachero para tomar algo | El Botellón, 21:30 | Price, opening hours and atmosphere unconfirmed |
| Romantic dinner for two, ARS 80,000 | ÑAM Sexta Sección, from ARS 23,800 | A minimum is not a proven total; romantic fit unconfirmed |
| Beer and snacks with friends | Birra House, 20:30 | Price and hours unconfirmed |
| A nice merienda | De Zero, 17:30 | Price and hours unconfirmed |
| Something premium | Centauro Restaurant, 21:00 | Official hours; no usable price |
| Cinema and dinner | Cinemark “LA CASA”, 20:00 → Anna, 22:45 | Cinema confirmed; dinner hours unconfirmed; ARS 58,400 minimum |
| Family outing | Angolo Dolce, next-day noon | Unknown price/hours; family breadth remains weak |
| Fun without eating | No viable evening proposal | Missing usable entertainment coverage; FAILED |
| A day in Potrerillos | La Posta, 13:00 | Only a meal, not a convincing full day; unknown price/hours |
| Winery and lunch in Uco | Andeluna tasting → lunch, ARS 279,000 | Genuine offerings; opening hours unconfirmed |
| Culture tonight | Estación Cultural Ciudad, 20:30 | No confirmed program/hours/price |
| Adventure | Norton cycling and tasting, ARS 70,000 | Offering exists; availability/hours unconfirmed |
| Cheap Godoy Cruz plan | Burger Bar & Cafe, 21:00 | Correct area; cheapness and opening cannot be demonstrated |
| Something now | Fuente y Fonda, 20:15 | Hours and consumption estimate supported; not proof of available tables |
| Stylish quiet date | Fuente y Fonda, 21:00 | Atmosphere explicitly remains unconfirmed |

Reproduce against a **confirmed local catalog database**, with provider keys
unset and live discovery/verification disabled:

```powershell
pnpm eval:plans -- --at 2026-10-19T22:26:34.686Z --out .tmp/evaluation
pnpm knowledge report --out .tmp/coverage.md
pnpm knowledge discover --sources catalog-data/mendoza-v1/official-source-hints.json --confirm smartplan_planning
```

Acquisition changes local observations. Historical opening-hour projections are
not a temporal database: after further refresh, use a current evaluation time;
future observations are deliberately ineligible for an earlier request.

## Dynamic inventory and preparation

Two consecutive permitted Cinemark refreshes each observed 103 screenings for
19–21 October; the second withdrew zero. The database contained 147 historical
rows and 147 distinct venue/title/time/room identities, with 102 future active
rows at the later metrics snapshot. No duplicate growth was observed. Startup
refresh restores missing/expired cinema coverage when the scheduler-enabled
worker starts; the existing six-hour/nightly schedules continue retrying.
An individual source failure does not abort the night's remaining sources.

One supported cinema does not imply all Mendoza cinemas. No new live events or
adventure inventory was fabricated. Required tickets and suggested restaurant
reservations link to official actions where available. Only a user's explicit
confirmation records preparation; SmartPlan does not book or buy.

## Journey and browser evidence

Production frontend on 127.0.0.1:3032 against isolated local API 3021, dummy paid
provider keys. Browser verified login, manual place search, explicit addition,
save, reopening the saved Place Action and editing the draft. Plan 300 retained
Anna as `placeId: 23`, `action: meal`, `activityId: null`. The final editor shows
“Almuerzo o cena” instead of `meal`. The shared checker produced a 21:00–22:40
timeline and explicitly stated that price and opening were unconfirmed; it
offered continuations and a cheaper-search action without silently adding stops.

Existing editorial typography, ember palette and catalog/timeline composition
are retained. The new place search is a compact disclosure, with source-derived
actions, keyboard controls, announcements, disabled duplicate additions and
honest empty/error states. Earlier desktop captures are local scratch evidence.
Final screenshot/viewport capture lost its browser connection; tablet/mobile,
intermediate widths, reduced motion, final map fallback and full outing/feedback
visual acceptance remain **unverified**, not accepted by component tests.

## Measured performance and verification

41-request offline engine: p50 **292 ms**, p95 **498 ms**, maximum **1,010 ms**.
Intent p50/p95: **4/18 ms**; retrieval **283/481 ms**; solver **2/8 ms**;
external verification **0/0 ms**. Model calls, input/output tokens and paid
verification calls: **zero by offline execution**, not an estimate of live Gemini
performance. Paid-provider cost for this evaluation is zero. Browser time to
useful content and live provider latency/cost were not measured.

Backend final full unit run: **123 suites, 1,182 tests passed; 5 tests skipped**.
Lint and production compilation passed during closure. Complete integration run:
**31 suites / 277 tests passed**, plus **8/8** in the final affected Intelligent
Search rerun.
Migration validation applied all 35 migrations to a new local scratch database,
reversed the seven Intelligent Search migrations, then reapplied all seven.
This increment introduces no entity/schema migration.

Frontend lint, TypeScript and isolated production builds passed. Final full test
rerun: **151 files / 1,045 tests passed** with two workers. An earlier overloaded
run had a worker timeout and is not represented as green. Generated JSON, source captures, build
directories and logs remain outside the committed feature diff.

## Remaining acceptance limits

The strongest supported experience is still narrow. Broad current menu/hour
coverage, restaurant atmosphere evidence, independent entertainment, specialty
coffee proof, full-day destination composition, multi-cinema/event inventory,
automatic table/ticket availability and full rendered acceptance are incomplete.
Manual checking does not invent a price for an intrinsically unpriced stop.
Closed/restricted sources remain unavailable. A green technical suite does not
remove these product gaps or authorize production publication.

Related delivery: backend PR #142 and frontend PR #196; neither is merged or
deployed by this task.
