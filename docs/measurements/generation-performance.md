# Staging generation measurement — #119

2026-10-15 (America/Argentina/Salta). Baseline: public staging API, dedicated QA account without stored preferences. Most recent successful GitHub deployment reported ref `50b7fda37186bc34fbaa5b3ab814d51fad6e7713`; implementation base: `develop` at `50fadb4`. No deployment or remote database access was performed.

## Before

20 sequential submissions: 10 automatic, 10 surprise. No POST retries or warmups. Each status request finishes before waiting another 300 ms, so sampling also includes HTTP latency. Percentiles use nearest rank on successful requests only. These are client-observed times, including submission, polling, and loading the generated plan details; they are not exact worker durations.

| Mode | Submitted | Generated | Failed | p50 observed ms | p95 observed ms |
|---|---:|---:|---:|---:|---:|
| all | 20 | 19 | 1 | 10511 | 15946 |
| automatic | 10 | 9 | 1 | 13368 | 15946 |
| surprise | 10 | 10 | 0 | 9659 | 10511 |

Request 39 (automatic) failed with `NO_VALID_COMBINATIONS` after 8,042 ms. All 20 requests reached a terminal state. The first romantic request took 15,946 ms and proposed plazas, Anna Bistró and Teatro Independencia; the intermittent fast-food symptom was not reproduced in this baseline sample.

## Stage visibility

The raw sample retains the progress stage and its server timestamp when observed. Polling missed fast transitions. Only consecutive observed transitions matching the full pipeline are summarized below; sparse samples are diagnostic and cannot establish a representative per-stage distribution. Queue wait and finalization require server logs and remain unmeasured.

| Stage interval | Samples | p50 ms | p95 ms |
|---|---:|---:|---:|
| interpreting → locating | 4 | 1910 | 2241 |
| locating → searching | 0 | N/A | N/A |
| searching → composing | 1 | 290 | 290 |
| composing → routing | 1 | 1732 | 1732 |
| routing → finalizing | 1 | 227 | 227 |
| RabbitMQ queue wait | 0 | N/A | N/A |
| finalizing → generated | 0 | N/A | N/A |

## After — pending staging deployment

The implementation has not been deployed to staging. No after numbers or staging quality acceptance are claimed. Deploy the PR branch in the existing staging service, retain its current environment variables and native-worker configuration, and repeat the identical 20-request sample using the same QA account and catalog. No migration or seed is required. Restore the previous deployment after the rehearsal if the PR is not merged.

```sh
node scripts/measure-generation-performance.mjs /tmp/smartplan-119-135-qa.json after /tmp/smartplan-119-135-after.json
```

The session file is local, mode 0600, and contains the QA credentials. It must never be committed or uploaded. The script refreshes the session before measuring. The output contains only request IDs, test queries, outcomes, observed stage timestamps and plan names/IDs.

Export API/native-worker logs for the before/after request IDs, retaining only structured generation events: `plan_request_prepared`, `plan_request_published`, `plan_generation_attempt_started`, `plan_generation_stage_completed`, `candidate_query_completed`, `gemini_call_completed`, `maps_routes_completed`, `plan_generation_completed`, `plan_generation_failed`. Join on `planRequestId` to obtain queue wait, stage timings, exact server totals and provider tokens. Do not infer missing stages from polling or include credentials/user profiles.

Acceptance remains p50 ≤ 7,000 ms and p95 ≤ 10,000 ms, with failure rate and per-mode distributions reported separately. Compare plan quality, generic requests and preference fixtures. Until the after sample and complete stage logs exist, #119 is not verified.
