# Intelligent Search v1 — continuation evidence, 17 October 2026

**Status: in progress; not accepted as an excellent or complete product.** All work is local. No push, merge, deployment, remote database write or paid-provider call was used for these checks. Existing dirty work and the staged catalog release deletion were preserved.

## What changed

- Knowledge promotion now bounds OS DNS, robots, redirects, response bodies and individual hints. Windows OS DNS runs in a cancellable subprocess; direct DNS queries against the local resolver had failed and were excluded from valid promotion evidence. Page and redirect requests retain domain policy, robots and public-address checks. Transient failures remain retryable; terminal completed hints can be resumed from a checkpoint.
- The resumed pass completed 1,094 hints. It promoted **zero** new verified venues. Four hints exhausted their 90-second deadline without blocking completion. Repairing execution did not solve geographic coverage.
- Acquisition reports identity failures and empty facts explicitly. Explicit product/variant/price associations are preserved, including nested product-card prices. Two ÑAM branches gained menu observations; Bony's Pizza gained one after a further parser fix. These are published prices, not generated estimates. Pizza portions without explicit sharing information remain conservative; no sharing count was invented.
- Creator calls the shared check endpoint with a user-selected day, time, transport and optional budget. It exposes schedule issues, real detail links, continuations and an explicit cheaper-catalog search. It never changes stops automatically. Activity-backed drafts are supported; authoring/saving place-action drafts remains incomplete.
- Result refinement exposes whole-plan and per-stop changes. Actual API QA swapped the middle stop while preserving the first and last stops and their times. The new controls have component coverage but lack fresh rendered-browser acceptance.
- Optional outing feedback captures stop completion/skipping, explicit spend, context and incorrect-data reports. PostgreSQL/API integration verifies exactly one explicit spend observation, no distribution of the outing total, a community trait, a pending closure revalidation and a personal avoidance signal.
- Actual API cinema QA exposed two defects: “algo dulce” was not recognized as dessert, and “ahora” could select a screening hours later. Both were corrected and covered by focused tests. The saved API results predate those fixes and **must not** be presented as after-fix API evidence.
- The search header now distinguishes confirmed open candidates from candidates with unknown hours.

## Data results

See [before coverage](coverage-before.md), [after coverage and zone × intent matrix](coverage-after.md) and [raw current metrics](knowledge-metrics.json).

| Measure | Current evidence |
|---|---|
| Published places / with coordinates | 413 / 282 |
| In-review places / with coordinates | 174 / 0 |
| Menu observations / distinct venues with fresh menus | 8 / 6 |
| Distinct venues with fresh hours | 15 |
| Screenings | 210, one cinema complex, five local dates |
| Source discovery idempotency | Two runs: 64 hints, zero new source rows each |
| Cinema refresh idempotency | Two runs: 210 screenings each, zero withdrawn, no duplicate growth |

The Bony's Pizza refresh updated an existing hours source; it did not add a sixteenth venue with hours. Its new menu does not improve the located-restaurant matrix because location is still unresolved. A strict Georef lookup of its published San Rafael address returned no unambiguous point; no coordinate was invented or copied from a provider.

Located restaurant pools remain Ciudad 56, Godoy Cruz 0, Guaymallén 8, Luján/Chacras 3, Maipú 3, Valle de Uco 0 and San Rafael 0. Verified source status is an automated identity-check result, not a human audit of every source. Branch identity and provenance remain review concerns.

## Evaluation V2

The [29 scenario records and root-cause matrix](evaluation-after/summary.md) retain strict semantic, time and price requirements. The corrected-engine run yielded **24 UNCERTAIN, 1 PARTIAL, 4 FULL**. Two FULL outcomes are expected refusals of impossible requests, so there are only **two FULL outcomes delivering plans**. Do not report this as four completely satisfied outings or as broad product acceptance.

This evaluation used a fixed reference clock and disabled live verification. It is not a provider latency benchmark or evidence that every current real-world venue is open. Repeating it after the final additional menu observation produced the same classification and did not repair the located coverage gaps.

## Verification

- Backend full units after cinema corrections: **988 passed, 5 skipped**, 108 passing suites. The subsequent nested-price extractor change passed its 7-test suite; final focused lint/build evidence is recorded separately.
- Full PostgreSQL e2e run: 271 passed, one catalog assertion failed because the digits `321` could occur randomly inside an envelope hash. The assertion now inspects the actual recursive place/activity payload, retaining restricted-field checks. All 24 catalog tests passed on rerun. This was not a clean all-suite rerun.
- Feedback learning API/PostgreSQL integration: **9 passed**, including the new explicit-stop learning case. No feedback fixtures were inserted into the real catalog QA database.
- Fresh migration database `smartplan_resume_migrations_20261017_test`: **32 migrations up**, then all four new migrations down in reverse order and up again. The QA catalog database was not reverted.
- Frontend focused tests exercise refinement, Creator checks, price uncertainty, the cheaper-search action and optional stop feedback. Closing full suite: **1,027 tests passed / 144 files**. Lint, TypeScript and the isolated production build completed without errors. jsdom emitted its existing document-navigation notices; there were no failed tests.
- Backend full lint completed without errors before the final nested-price change; focused lint, production build and whitespace checks passed after it. Both repositories passed final whitespace checks. PowerShell logs contain wrapper `NativeCommandError` entries for normal tool stderr; these alone are not failures. The final backend process-status artifact records actual exit codes of zero.
- New frontend build output is isolated in `.next-resume`; it does not replace `.next` or the old `.next-qa` server.

## Product scorecard

Provisional scores describe evidenced product behavior, not implementation effort. NR means there is insufficient current evidence to assign a defensible score.

| Dimension | Score / 10 | Evidence and limitation |
|---|---:|---|
| Intent understanding | 7 | 29 evaluated queries; real cinema/dessert/now defects found and fixed; broader language remains unproven. |
| Candidate breadth | 2 | Zero new promotions; major zones lack located restaurants. |
| Contextual relevance | 4 | Different anchor sets by context; very sparse corroborated romantic/group traits. |
| Budget accuracy | 3 | Conservative unknown-price handling; only six venues with fresh menu evidence. |
| Time feasibility | 5 | Closing/arrival checks and fixed screening starts; only 15 venues with fresh hours. |
| Geographic coherence | 4 | Travel checks and disclosed fallback; missing coordinates and geographic gaps remain. |
| Dynamic-data freshness | 6 | Repeatable official cinema refresh; only one complex and limited menu/hour coverage. |
| Plan diversity | 6 | Three alternatives and differing anchor sets; small regional pools limit variety. |
| Uncertainty handling | 8 | Strict unknown-price/hour caveats, partial outcomes and expected refusal scenarios; not full product acceptance. |
| Explanation quality | 5 | Source/budget/time explanations and corrected open count; new controls not visually verified. |
| Refinement quality | 6 | Real API A→B→C to A→D→C preservation; rendered interaction pending. |
| Manual Creator intelligence | 4 | Shared checks and explicit cheaper search; place-action authoring and seamless replacement incomplete. |
| Post-plan learning | 6 | Real API/DB assertions for spend, tags, revalidation and personal avoidance; rendered flow and long-term recommendation effects pending. |
| Performance | NR | Debounce/abort tested; no representative end-to-end latency distribution. |
| Desktop UX | NR | Existing older QA UI inspected; new build could not be launched for fresh acceptance. |
| Mobile UX | NR | No fresh responsive/keyboard/reduced-motion evidence for the new controls. |

## Remaining acceptance work and execution restriction

Actual remaining work includes safe location enrichment and reviewed venue sources in uncovered zones, more explicit drink/main menu evidence and hours, trustworthy contextual traits, place-action Creator authoring/persistence, after-fix cinema API QA and browser verification of all new flows at desktop/intermediate/mobile widths, keyboard, loading/error and reduced motion.

Automatic approval review rejected stopping/replacing the existing QA frontend, launching the isolated frontend on 3014, and later restarting the isolated backend with a separate broker vhost. The tool returned only **“blocked by policy”**, without a specific reason. No equivalent launch was attempted through another mechanism after rejection. These checks remain pending; passing tests and a production build do not substitute for rendered-product evidence.

All review artifacts exclude authentication credentials and tokens. Temporary whole-page extraction diagnostics were removed after the parser investigation.
