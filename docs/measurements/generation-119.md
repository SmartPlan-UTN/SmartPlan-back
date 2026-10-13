# Local generation measurement — issues #119 / #146

Exploratory local sample: five automatic and five surprise requests per batch. No warmups, concurrency load or POST retries. Provider retries belong to the request and are included in its logs.

Successful generation latency and time to failure are separate. N/A means no observation; a fast failure does not satisfy the generation objective. Observed time includes HTTP and polling (300 ms interval). Percentiles use nearest rank.

| Batch | Mode | Requests | Generated | Failed | Successful observed p50 ms | Successful observed p95 ms | Failure observed p50 ms | Logged tokens |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| before | automatic | 5 | 0 | 5 | N/A | N/A | 1235 | 1074 |
| before | surprise | 5 | 0 | 5 | N/A | N/A | 592 | 0 |
| after | automatic | 5 | 0 | 5 | N/A | N/A | 1548 | 1084 |
| after | surprise | 5 | 0 | 5 | N/A | N/A | 585 | 0 |

## Stage measurements

Medians in milliseconds, including unsuccessful requests. Missing final-stage timings on the original backend are left N/A. “Queued” in the original logs includes preparation and publication; the updated backend additionally records queue wait from the job envelope timestamp. Retry queue wait is cumulative from the original publication.

| Batch | Mode | Stage | Samples | p50 ms | p95 ms |
|---|---|---|---:|---:|---:|
| before | automatic | preparation | 0 | N/A | N/A |
| before | automatic | publication | 0 | N/A | N/A |
| before | automatic | queue-wait | 0 | N/A | N/A |
| before | automatic | queued | 5 | 265 | 384 |
| before | automatic | interpreting | 5 | 873 | 1603 |
| before | automatic | locating | 5 | 19 | 21 |
| before | automatic | searching | 0 | N/A | N/A |
| before | automatic | composing | 0 | N/A | N/A |
| before | automatic | routing | 0 | N/A | N/A |
| before | automatic | finalizing | 0 | N/A | N/A |
| before | surprise | preparation | 0 | N/A | N/A |
| before | surprise | publication | 0 | N/A | N/A |
| before | surprise | queue-wait | 0 | N/A | N/A |
| before | surprise | queued | 5 | 266 | 458 |
| before | surprise | interpreting | 0 | N/A | N/A |
| before | surprise | locating | 5 | 8 | 13 |
| before | surprise | searching | 0 | N/A | N/A |
| before | surprise | composing | 0 | N/A | N/A |
| before | surprise | routing | 0 | N/A | N/A |
| before | surprise | finalizing | 0 | N/A | N/A |
| after | automatic | preparation | 5 | 5 | 9 |
| after | automatic | publication | 5 | 232 | 235 |
| after | automatic | queue-wait | 5 | 251 | 362 |
| after | automatic | queued | 5 | 277 | 389 |
| after | automatic | interpreting | 5 | 852 | 1757 |
| after | automatic | locating | 5 | 24 | 29 |
| after | automatic | searching | 5 | 11 | 15 |
| after | automatic | composing | 0 | N/A | N/A |
| after | automatic | routing | 0 | N/A | N/A |
| after | automatic | finalizing | 0 | N/A | N/A |
| after | surprise | preparation | 5 | 4 | 8 |
| after | surprise | publication | 5 | 232 | 232 |
| after | surprise | queue-wait | 5 | 337 | 424 |
| after | surprise | queued | 5 | 359 | 445 |
| after | surprise | interpreting | 0 | N/A | N/A |
| after | surprise | locating | 5 | 10 | 16 |
| after | surprise | searching | 5 | 8 | 11 |
| after | surprise | composing | 0 | N/A | N/A |
| after | surprise | routing | 0 | N/A | N/A |
| after | surprise | finalizing | 0 | N/A | N/A |

## Limitations

- The local catalog returned only 0–1 eligible activities. Requests ended with `NO_VALID_COMBINATIONS`; composition, routing and successful generation latency could not be measured.
- Staging acceptance remains pending. Successful percentiles are N/A when no plans were generated.
- Provider token totals cover logged successful calls, not unreported provider failures or billing adjustments.

## Request outcomes

| Batch | Request | Mode | Outcome | Code | Observed ms |
|---|---:|---|---|---|---:|
| before | 6 | automatic | failed | NO_VALID_COMBINATIONS | 2241 |
| before | 7 | surprise | failed | NO_VALID_COMBINATIONS | 592 |
| before | 8 | automatic | failed | NO_VALID_COMBINATIONS | 1229 |
| before | 9 | surprise | failed | NO_VALID_COMBINATIONS | 589 |
| before | 10 | automatic | failed | NO_VALID_COMBINATIONS | 1544 |
| before | 11 | surprise | failed | NO_VALID_COMBINATIONS | 594 |
| before | 12 | automatic | failed | NO_VALID_COMBINATIONS | 1225 |
| before | 13 | surprise | failed | NO_VALID_COMBINATIONS | 602 |
| before | 14 | automatic | failed | NO_VALID_COMBINATIONS | 1235 |
| before | 15 | surprise | failed | NO_VALID_COMBINATIONS | 571 |
| after | 16 | automatic | failed | NO_VALID_COMBINATIONS | 2252 |
| after | 17 | surprise | failed | NO_VALID_COMBINATIONS | 585 |
| after | 18 | automatic | failed | NO_VALID_COMBINATIONS | 1559 |
| after | 19 | surprise | failed | NO_VALID_COMBINATIONS | 606 |
| after | 20 | automatic | failed | NO_VALID_COMBINATIONS | 1243 |
| after | 21 | surprise | failed | NO_VALID_COMBINATIONS | 571 |
| after | 22 | automatic | failed | NO_VALID_COMBINATIONS | 1548 |
| after | 23 | surprise | failed | NO_VALID_COMBINATIONS | 592 |
| after | 24 | automatic | failed | NO_VALID_COMBINATIONS | 1242 |
| after | 25 | surprise | failed | NO_VALID_COMBINATIONS | 576 |

## Execution and validation

- Date: 2026-10-12 (America/Argentina/Salta).
- Baseline: `develop` at `3ad0bd6`; updated code: `fix/119-generation-deadline` working tree. Node 24, local PostgreSQL/RabbitMQ, sequential requests, same dedicated account and catalog, no profile preferences.
- Observed intent model: `gemini-flash-lite-latest`, unchanged. No composition calls were made because candidate selection failed. Exactly 20 requests and 10 successful Gemini intent calls across both batches, totaling 2,158 reported tokens; no extra real requests were made for the automated tests.
- Backend: lint, build, 650 unit tests and 218 integration tests passed. Five optional spike tests remain skipped.
- Frontend: lint, production build and 873 tests passed; 24 focused tests also passed after final cleanup. Desktop/mobile Playwright checks covered the animated bar, 15 s notice, terminal timeout, absence of horizontal overflow at 390 px and reduced motion.
- An additional standalone frontend `tsc --noEmit` check reports existing test-fixture typing errors outside the production build (session mocks and plan-detail fixtures); the touched polling fixture was brought up to date. No production type/build failure was observed.
- Code and local validation only: no Railway changes, deployment or issue closure. Changes are submitted for code review through pull requests. Successful latency and staging acceptance remain pending a representative catalog and an authorized staging measurement.
