# Intelligent Search local acceptance evidence

Review dates: 2026-10-16–17, America/Argentina/Mendoza. Branch in both repositories: `feature/intelligent-search-v1`. This records local implementation evidence, not a deployment or a claim of complete real-world catalog coverage.

## Review environment

- Frontend: http://127.0.0.1:3012, isolated `.next-qa` production build.
- API/worker: port 3013, local `smartplan_planning` database and dedicated `smartplan-qa-v1-20261016` broker vhost. Backend Google/Gemini keys are dummy QA values; live verification and scheduler are disabled.
- Integration fixtures use `smartplan_intelligent_20261016_test`, a localhost-only guard and a separate broker vhost. Each suite recreates that disposable schema. No canonical menu observations were added for fixtures.
- Existing processes, unrelated dirty work and the staged catalog release deletion were preserved. No push, merge, remote migration or deployment.
- An initial browser probe used stale port 3010, which still targeted the previous API on 3001. It is excluded from acceptance evidence. Frontend maps load the existing Google Maps configuration; this report makes no zero-billing claim.

## Automated evidence

- Backend full unit run: `pnpm test --runInBand`, 100 suites / 956 tests passed, 5 optional tests skipped. Includes plural low-travel phrases, local word-number normalization, FROM prices and overlapping bounded price comparisons.
- Backend full PostgreSQL integration run: `node .tmp/e2e-run.cjs`, 31 suites / 271 tests passed. Closing menu/partial-result/outing changes: 2 suites / 19 tests passed, including the added cinema-only rejection and preserved outing caveats.
- Frontend full run: `pnpm test`, 141 files / 1,020 tests passed. Closing detail/outing changes: 2 focused files / 25 tests passed; feedback date correction: 38 tests passed; final empty-result copy/request-screen checks: 2 files / 16 tests passed; price-unit/detail readers: 3 files / 37 tests passed. The full-suite count precedes the two additional regression tests.
- Both repositories passed full lint and production builds. Subsequent changed files received focused lint; the final production builds include those changes. `git diff --check` passes in both repositories.

The real PostgreSQL integration fixture covers reviewed JSON-LD menu observation → whole-group meal basket → generated Place-action plan → API projection → selection into an outing. A meal for two costs ARS 54,000 in the fixture; expiry removes the budget-fit assertion. Cinema remains explicitly unsupported. Fixtures and source URLs are synthetic test inputs, not production venue data.

## Browser evidence

Verified in Chrome through the actual API, RabbitMQ worker and local database using a disposable `smartplan.test` account.

| Surface | Evidence |
|---|---|
| Interpretation | Romantic dinner for two, tomorrow, ARS 80,000 and low travel appear as understood; no invented explicit department. Local intent strategy confirmed in API logs. |
| Generation/persistence | Request 6 generated plans 16–18 with quarter-hour times and sequential stops. Reload/back preserve the request and interpretation. |
| Selection | Plan 16 selected into outing 19. Dinner/drinks/dessert Place actions, times and unknown-price state survive the copy. |
| Partial request | Request 7 explicitly reports missing cinema and preserves the caveat in saved insight. The closing correction keeps only supported required stops, rather than optional filler when a required experience is unavailable. |
| Price evidence | Plan 20 detail links to the official Anna published PDF. FROM and unknown costs remain partial and are not presented as a complete budget guarantee. |
| Keyboard | Native disclosure summaries expand with Enter, expose every caveat and show visible keyboard focus. |
| Desktop | 1440×900 and the normal wide desktop viewport inspected. |
| Intermediate | 1024×768 results inspected; no horizontal overflow. |
| Tablet | 768×1024 outing detail inspected; no horizontal overflow. |
| Mobile | 390×844 current results and map toggles inspected; real map tiles, ordered pins and carousel controls visible. The empty live-status row and excessive top padding were removed. |
| Feedback | Completing the disposable outing opens feedback with Place actions without crashing. No fabricated ratings or spending submitted. Date formatting corrected to Mendoza and wording changed to “paradas”. |
| Final feedback correction | Outing 19 and its dialog both show 16 October / “16 OCT · 3 PARADAS”; the dialog was closed without submitting. Its saved unknown-budget and price/hour caveats are visible in outing detail. |
| Currency error/recovery | Request 11 at 360×640 explains ARS-only budgets and returns successfully to the composer. Document width equals scroll width (345 px); no horizontal overflow. |
| Empty experience | Request 12 explicitly says “Todavía no podemos planificar cine” and explains missing verifiable hours/proposals, without suggesting an unrelated dinner or a zone change. |
| Final plural travel | Request 14 preserves “sin movernos mucho” as “Poco traslado”, with local interpretation in the worker log. Best plan 29 has about 7 minutes of modeled transfer and no claimed budget fit. Fresh 1440×900 and 390×844 screenshots inspected; no horizontal overflow. |
| Final partial comparison | Request 15 at 768×1024 offers only the supported dinner. No VALUE label or monetary-saving claim is inferred from FROM prices. Plan 32 opens through its actual card link and shows missing cinema and unconfirmed hours in the detail. Selection creates outing 35. |
| Final price-unit layout | Outing 35 retains the cinema/hour caveats, official source link and group total FROM ARS 98,000. Its itinerary and breakdown explicitly label FROM ARS 49,000 per person. Fresh 360×640 and 390×844 screenshots confirm complete labels, wrapped source/map controls and visible keyboard focus; scroll width equals document width (345 / 375 px). The final CSS correction received another successful production build. |

The connected browser supports viewport overrides but provides no reduced-motion emulation capability. Reduced-motion behavior has static code coverage only; a rendered operating-system reduced-motion pass is not claimed. Browser screenshots were inspected during review; this report does not claim saved screenshot files.

## Product assessment and limits

The offline catalog evaluation separates structural validity from FULL/PARTIAL/UNCERTAIN/FAILED product satisfaction. The 14-scenario run is structurally valid throughout, but real source coverage leaves 13 UNCERTAIN and the cinema request PARTIAL. None is mislabeled FULL merely because a proposal was generated. See [summary](summary.md) and per-scenario JSON for evidence and missing experiences.

The menu phase provides an offline reviewed JSON-LD importer, source/freshness/portion tracking and LIGHT/STANDARD/FULL basket estimates. Broad venue menu/hour acquisition, PDF/HTML adapters, automated permitted refresh, dated cinema/events/adventure inventory, Place-level feedback/revalidation, shared manual creator intelligence and incremental refinement remain wider-ticket work. Place-backed authored plans have a safe read-only editing handoff; the Activity editor cannot yet edit them.

Browser QA additionally found plural low-travel wording and unsafe savings comparisons between FROM offers. Both were corrected generically: group travel constraints remain local and explicit, and monetary savings compare the alternative's upper bound against the best plan's lower bound. Unbounded FROM offers and overlapping ranges cannot claim confirmed savings.

Release readiness still requires current source coverage and the outstanding rendered reduced-motion check. Local engineering checks do not establish a credible full-budget promise for the current sparse catalog.
