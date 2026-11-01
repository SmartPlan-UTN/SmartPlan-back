# Efficient plan generation (CU17/CU19/CU21)

## Requirements and verification

- Explicit budget, duration, locality, radius, time of day and party size are hard constraints. Saved category preferences and feedback are ranking signals; they must not silently exclude otherwise useful activities.
- Preserve existing catalog costs as whole-party amounts. Optional `costBasis: per_person` multiplies the activity cost by the resolved party size. Missing party size means one person for that calculation.
- Optional activity availability periods and participant bounds are maintained through administration. An empty availability list means unknown, not closed. Do not invent opening hours or live capacity.
- Prefer locations expressed in the query over implicit device/profile location. Retain a usable explicit search centre and radius.
- Bound the candidate pool in PostgreSQL, then build a small relevant and diverse shortlist using text, category preference, feedback, quality, proximity and cost/duration compatibility. No unbounded result download or random-only selection.
- Resolve unambiguous requests locally. Keep Gemini for language interpretation that needs it. Single-candidate requests bypass composition; deterministic valid alternatives recover from provider failure or unusable proposals.
- Gemini receives a bounded query and compact shortlisted metadata, never credentials or account identifiers. Validate ids, uniqueness, group cost, duration, availability and alternatives independently of model output.
- Travel time participates in duration checks when known. Optional routing never prevents a usable result from being saved. Deduplicate routes and alternatives and reserve persistence time within the existing deadline.
- Expose the resolved parameters to the frontend, including moment, party size and duration, and provide editable controls for supported explicit constraints and catalog metadata.
- Record safe stage timings, strategy, provider calls and shortlist sizes. Regression tests cover hard/soft constraints, personalization, deterministic paths, provider fallback, prompt bounds and travel-time validation.

## Data limits

The current catalog does not contain live booking capacity, dated opening hours, weather or transport fares. These cannot be truthfully enforced. Availability periods and participant limits represent catalog compatibility only. Unknown metadata remains usable and is not presented as verified availability.

## Implementation and operational limits

Explicit selections override interpreted text; saved profile values fill missing fields. A locality named in the query overrides implicit device/profile location. Explicit categories and exclusions constrain eligibility; saved categories, the requester's non-rejected feedback, moderated ratings and external rating confidence influence ranking. Local parsing handles supported Spanish numbers, ARS amounts, group size, duration, moment, radius and transport. Ambiguous language uses Gemini; interpretation failure retains usable locally resolved values.

PostgreSQL applies group cost, participant, moment, duration and geographic constraints before returning at most 80 ordered candidates. Text relevance uses name and description, with OR semantics for multiple interests; the shortlist balances relevance and category diversity and contains at most 24 activities. Category metadata is loaded in the same query. The geographic search combines a bounding box and exact distance, selecting the nearest usable location per activity. Implicit geographic searches can cross locality boundaries; explicit locality remains a constraint. Resolved options are snapshotted for repeatable processing.

Locally resolved requests, surprise requests and single candidates use deterministic composition without a Gemini composition call. Complex requests can use Gemini, with deterministic recovery from invalid output or provider failure. Compact candidate rows use a shared category dictionary and a 4,000-character payload ceiling. Interpretation output is capped at 512 tokens and composition at 1,800 tokens. Interpretation waits at most 7 seconds, pipeline composition at most 12 seconds, and optional Maps routing at most 5 seconds, within the existing overall deadline and a 2-second persistence reserve. These are ceilings, not measured production latency or token savings.

At most six distinct plans with four stops are composed. Budget applies to the whole group; text can specify a per-person budget. Existing catalog costs retain `per_party` semantics unless explicitly maintained as `per_person`. Generated and manually edited plans preserve per-person unit-price snapshots, so changing the group size rescales only those costs. Travel mode supports driving, walking and cycling. Duration includes actual route time when available, otherwise a proximity-based estimate; it does not guarantee traffic or opening times. Route requests are reused for identical paths and mode.

Frontend controls expose duration, radius, transport and opt-in device location. Resolved parameters appear with the results. Administration can maintain cost basis, availability periods and participant bounds. Empty searches retain the existing Spanish no-plans state; invalid radius/currency requests offer actionable recovery.

## Review and rollout

Work is prepared on `codex/efficient-plan-search` in both repositories. Local validation and PR links are recorded in TRACKING.md. The focused PostgreSQL suite checks filtering, ranking, bounded results, per-person snapshot updates and migration rollback/reapply against an isolated test schema. Provider behavior is simulated in unit tests; no production benchmark or real-provider acceptance is claimed.

Deploy the backend with migrations `1791939600000` and `1791939601000` before the frontend. Existing activities default to whole-party costs and unknown availability. Catalog maintainers must supply accurate new metadata for those constraints to become meaningful. Railway's broker topology and variables are unchanged; production migration/deployment and required approvals remain pending.
