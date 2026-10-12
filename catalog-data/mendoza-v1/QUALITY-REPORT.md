# Mendoza catalog v1: data quality report (batch 001)

Measured on the local `smartplan_mendoza` database on 2026-10-12, package
version 2, content hash
`68828677825f436f96f436e81838112e1f483647a09da308f9c525e9c290d208`.

## Size

| | |
| --- | --- |
| Source records inspected | 113 wineries + 1,068 eateries (registries), 46 plazas/parks, ~100 Wikidata POIs, 52 EMETUR winery prices, 68 EMETUR menus |
| Places published | 288 (of 292; 4 archived) |
| Activities published | 252 (4 archived) |
| Places vs activities | 288 : 252 (plazas are Places with and without an activity) |
| Google Place ID linked | 245 places |
| Duplicates merged / dropped | registry overlaps (winery restaurants, repeated wineries, near names) removed by the builder; 0 duplicate groups reported by the importer |
| Re-import of the exported package | 288 places / 252 activities `unchanged` (idempotent) |

## Google matching (about 380 text searches)

| Outcome | Count |
| --- | --- |
| Matched | 245 |
| Ambiguous (reviewed by hand, 17 accepted, rest dropped) | 63 |
| Unmatched (dropped) | 75 |
| Permanently closed (dropped) | 13 (e.g. Museo Nacional del Vino y la Vendimia, four EMETUR restaurants) |

The 2019 registries contain many places that no longer exist: validating
before publishing removed roughly one in three candidates.

## Geography (activities per department)

Luján de Cuyo 73, Ciudad de Mendoza 36, Maipú 31, San Rafael 28, Tupungato 18,
Tunuyán 18, Godoy Cruz 16, Guaymallén 12, Las Heras 12, San Carlos 8.

## Categories (activities; one activity may have several)

Gastronomy 218, Outdoors 20, Culture 14, Short trips 13, Nightlife 4, Sports 4,
Entertainment 1, Wellness 1. **The catalog is heavily gastronomy/winery.**
Non-gastronomy depth (museums, adventure, nightlife, wellness) is the main gap
and needs hand curation of venues with websites (see limitations).

## Price coverage (252 activities)

| Kind / source | Count | % |
| --- | --- | --- |
| UNKNOWN | 138 | 54.8 |
| FROM, CURATED | 98 | 38.9 |
| FREE, CURATED | 9 | 3.6 |
| RANGE, CURATED | 4 | 1.6 |
| FIXED, CURATED | 3 | 1.2 |
| OFFICIAL | 0 | 0 |

* 114 activities (45%) carry an honest price; 109 of them are older than 90
  days (EMETUR campaign dated 2026-02-15, Cacheuta/Villavicencio January 2026,
  Penitentes June 2026) and are labelled as reference prices.
* `FREE` appears only with positive evidence (public plazas, municipal data,
  press report of free entry).

## Google live context (245 linked places)

| | Count | % of linked |
| --- | --- | --- |
| Rating + review count returned | 238 | 97 |
| Coordinates returned | 245 | 100 |
| `priceRange` / `priceLevel` returned | 68 | 28 |

By kind: restaurants returned a price range for ~72% of matches, wineries for
~2%. Google price data is therefore useful for restaurants and almost useless
for winery tours, as expected (place-level data).

## Eligibility

| Flag | Count | % |
| --- | --- | --- |
| DISCOVERABLE | 252 | 100 |
| PLAN_ELIGIBLE | 252 | 100 |
| AUTO_RECOMMEND_ELIGIBLE | 113 | 44.8 |

Why 139 are not automatic: price unknown (138) and one without coordinates
at report time. Automatic recommendation needs a known, non-expired price.

## Search and product checks

* 49 Spanish free-text queries on the live API: 39 with results; zero results
  for "sushi", "cerveza artesanal", "trekking", "almuerzo en bodega",
  "cena romántica", "gratis", "aventura", "rafting", "cabalgata", "uspallata".
  Plain `search` is substring-based: natural-language intent goes through the
  Gemini assistant.
* Automatic generation (Gemini + local RabbitMQ) returned credible Mendoza
  plans for four scenarios (winery day in Luján, free cultural day, tight
  budget dinner, mountain adventure) with correct per-person totals.
* Saved plan snapshot: changing an activity price after saving did not change
  the saved plan's detail price or total.
* Real defects found by the data and fixed: map markers never loaded (Maps
  bounds had 14 decimals, API accepts 6), travel agencies and a bottle factory
  in the registries, unlocated-but-identified places stuck in review, category
  names untranslated, closed listings, a stale-price UI caveat without a date.
