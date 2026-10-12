# Mendoza catalog v1: sources, licences and caveats

Everything in `data/` is rebuilt from the versioned inputs in this folder by
`run.sh` (see `docs/catalog.md`). Nothing from Google except the Place ID is
stored; coordinates, ratings, photos and price ranges from Google are a
temporary cache (at most 30 days) that is never exported.

| Source | What we take | Licence / terms | Notes |
| --- | --- | --- | --- |
| Datos Abiertos Mendoza, dataset `enoturismo` (julio 2019) | winery names, street address, department | CC-BY-4.0 | Official registry of wineries open to visitors. 2019 snapshot: each winery is re-validated against Google (`businessStatus`) before it is published. |
| Datos Abiertos Mendoza, dataset `gastronomia-en-mendoza` (julio 2019) | restaurant / bar / café names, address, department | CC-BY-4.0 | Capped per department and re-validated against Google; ambiguous or unmatched rows are dropped. |
| Datos Abiertos Ciudad de Mendoza, `plazas-mendoza`, `cerros` | public plazas and parks with coordinates | CC-BY-4.0 | Municipal public spaces: `FREE` is justified by being open public space. |
| Wikidata (SPARQL) | coordinates and names of museums, parks, reservoirs, heritage sites | CC0 | Source of the only SmartPlan-owned coordinates outside the municipal dataset. Descriptions are written by us. |
| EMETUR campaigns "Mansa Bodega" and "Manso Menú" (mendoza.tur.ar) | winery visit and restaurant menu **reference prices** | No explicit reuse licence found | See below. |
| Press reports of official tariffs (Sitio Andino, El Sol, Economía Sustentable, Los Andes) | Cacheuta, Villavicencio, Aconcagua Horcones, Penitentes prices; MMAMM free entry; free public places | Facts only, linked | Stored as `CURATED` prices with the article URL and its date. |
| Google Places API (New) | Place ID (stored); rating, coordinates, price range, photo (temporary, live) | Google Maps Platform terms | Attribution is always rendered. |

OpenStreetMap / ODbL remains quarantined and is not used.

## Prices: what they are and are not

* There are **no `OFFICIAL` prices** in v1. Every priced activity is `CURATED`
  with a source URL and the date the evidence refers to.
* The EMETUR campaigns state they were valid until **15 Feb 2026**, so they are
  stored as `FROM` (or `RANGE`) reference prices **dated 2026-02-15**, never as
  a current price. They are stale by the 90-day rule and the UI says
  "Precio de referencia de febrero de 2026: confirmalo antes de ir".
  Automatic recommendation accepts them only because the bootstrap age dial
  (`CATALOG_AUTO_RECOMMEND_MAX_PRICE_AGE_DAYS=365`) is widened per environment.
* Google `priceRange` / `priceLevel` are never converted to an activity price;
  they are shown as "Referencia del lugar en Google Maps" and expire with the
  cache.

## Open items that need the owner

1. **mendoza.tur.ar reuse.** The site publishes no licence and its
   `robots.txt` asks AI crawlers to stay away. Only a few pages were read once
   by hand and only factual names/prices are kept, with the URL. Please confirm
   reuse with EMETUR, or delete every price whose `priceSourceRef` contains
   `mendoza.tur.ar` (a single query; the activities stay, as `UNKNOWN`).
2. **Provincial adventure providers** (`prestadores-de-turismo-aventura`) list
   people by name and ID number: they are personal data and were not used.
