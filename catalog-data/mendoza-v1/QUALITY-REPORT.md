# Mendoza Catalog v1 — local quality report

Measured 2026-10-14 on localhost/smartplan_mendoza. Historical archived rows remain for audit.

Package SHA-256: ac99e784018af663cf233b51a01ca36d28b991aabe2a68fe43ed4a2f0ad3274f

| Measure | Value |
|---|---:|
| Package Places | 583 |
| Published / discoverable Places | 409 / 409 |
| Package persistent Place points | 278 |
| Published Place coordinate coverage | 68% |
| Published Place description coverage | 8.3% |
| Published Activities | 74 |
| Discoverable Activities | 72 |
| Plan eligible Activities | 70 |
| Auto recommendation eligible Activities | 41 |
| Activities with known price | 51 (68.9%) |
| UNKNOWN price Activities | 23 |
| Stale prices | 9 |
| Open licensed Place images | 27 |
| Duplicate identity groups | 0 |

## Reproducibility and privacy

Two offline builds produced identical bytes. The exact package imported twice locally; the second import retained 583 Places and 74 Activities unchanged and archived zero rows. Restricted provider field scan passed. Persistent coordinates have provenance; temporary Google coordinates, ratings, photos and price context remain outside the package. All plan eligible location rows have persistent coordinates.

## Curation

The builder no longer synthesizes winery tastings or generic meals. Published products include official López, Lagarde, Andeluna, Norton, Cacheuta, Anna and ÑAM experiences. Prices preserve FROM / FIXED / RANGE / CONSUMPTION and per-person units; UNKNOWN never becomes FREE or a Google amount. Editorial durations are explicitly labelled. Three generic rafting/horseback products were retired because their operator and meeting point were not evidenced. 205 uncorroborated Google identities were removed from canonical association; this does not mean those businesses are closed.

## Geography

| Published Place department | Count |
|---|---:|
| Ciudad de Mendoza | 199 |
| Luján de Cuyo | 59 |
| San Rafael | 38 |
| Maipú | 32 |
| Godoy Cruz | 20 |
| Guaymallén | 18 |
| Las Heras | 18 |
| Tunuyán | 12 |
| Tupungato | 8 |
| San Carlos | 5 |

## Release limitations

The current result is a verified local catalog release, not full product approval. Permanent coordinate coverage of discoverable Places is 68%, below the requested high coverage. Search audit has 25 OK / 0 empty / 6 weak queries; the count classifier does not certify relevance. Adventure meeting points and family/nightlife/sushi depth remain limited. Nine dated prices remain visible with provenance; auto eligibility still enforces freshness. Automatic recommendation now uses the ordinary 90-day price threshold in the local runtime; dated prices are excluded from its priced core. No remote writes or deployment occurred. Provider billing invoice verification and successful live Gemini generation must be reported separately from mocked tests. Browser evidence is recorded in PRODUCT-QA.md.
