# Mendoza catalog v1: provenance and limits

The offline builder reads versioned raw inputs, reviewed identity decisions,
curated experiences and enrichment caches. FETCH=1 explicitly refreshes open
Georef/Commons evidence; an ordinary build performs no network requests.
Evidence dates are fixed inputs, not the date a package is rebuilt.

## Places and persistent coordinates

- Mendoza open data, July 2019 winery and restaurant registries: CC BY 4.0,
  business names and public addresses. Registry membership alone proves neither
  current opening nor the existence of an activity or a price.
- Provincial adventure registry, 2018: CC BY 4.0, trade names and public business
  addresses only. Personal names, IDs and private contacts are not exported.
- Ciudad de Mendoza plazas, cerros and address layers: CC BY 4.0, public spaces
  and address-matched points. Conflicting points for one address are rejected.
- Protected areas, IDE Mendoza: CC BY 4.0. An area boundary is not a visitor entrance.
- Wikidata: CC0, named public places and coordinates. Identity is reviewed separately.
- Georef Argentina: CC BY 4.0, approximate street-address points and departments.
  https://datosgobar.github.io/georef-ar-api/addresses/
  https://datosgobar.github.io/georef-ar-api/terms/
  Only unique street/number/department matches are accepted. Roads with kilometre
  markers and unresolved S/N addresses are not assigned fabricated street numbers.
  These are approximate address points, not surveyed entrances.
- Business-authored JSON-LD and publisher booking locations: explicit venue facts
  from Anna Bistro, Clos de Chacras, Lopez, Andeluna and Norton. Every point retains
  its source URL. A coordinate explicitly authored in the publisher's location link
  is publisher evidence; no Google geocoding or map-result content is used.

Every persistent point has coordinatesRef. Google response coordinates stay in
expiring cache content, never the package. OSM/ODbL inputs remain quarantined.
place-aliases.json records reviewed physical deduplication. rejected-identities.json
removes proven wrong Google branch IDs without inventing a replacement. Missing
points remain null. Old registry rows are not proof of current operation.

unconfirmed-identities.json removes 205 associations that could not be corroborated
by the stricter address/owned-point matcher. It records review decisions, not
provider response content or a claim that those venues are closed.
experience-review.json excludes three generic adventure products without a
verified operator/meeting point. Their Places remain independent discovery records.

## Activities and prices

Activities require concrete curated evidence. No generic meals or tastings are
generated from registry rows. Unknown admission/consumption is UNKNOWN, not FREE.

Current official product evidence includes:
- https://experiencias.bodegaslopez.com.ar/ and https://wosbooking.com/mro/bodegas-lopez
- https://lagarde.com.ar/visitas-degustaciones/ (no verified public price)
- https://termascacheuta.com/hotel-spa/ (October 2026 tariffs; park and hotel distinct)
- https://annabistro.com.ar/menus/annacartagales.pdf (September 2026 menu)
- https://wosbooking.com/mro/andeluna
- https://wosbooking.com/mro/norton
- https://nam-gourmet.com/ and https://nam-gourmet.com/carta/ (branch menus and publisher JSON-LD coordinates)
- https://linktr.ee/chachingo (Arístides branch identity; municipal point, no invented tasting product)
- https://www.sushiclub.com.ar/nuestros_espacios.php?provincia=15 (Vistapueblo address correction; no unverified menu price)

Each priced product retains its source, date, kind and unit. Booking prices
advertised as 'desde' are FROM. Consumption exclusions are described explicitly.
Publisher durations are retained; editorial planning allowances are explicitly
marked as estimates in descriptions and recorded in curated sidecars. Availability,
transport, age limits and reservations require venue confirmation. A provider's
office is not automatically an adventure meeting point.

EMETUR campaign references ended on 15 February 2026 and remain dated/stale.
No explicit reuse licence was found: only limited factual reference values are
kept, with attribution; campaign images and prose are not copied. Press-reported
prices are CURATED, not OFFICIAL business tariffs. Eligibility separately checks
price confidence and age. Local automatic recommendation now uses the ordinary
90-day threshold; the previous 365-day bootstrap exception was removed.

## Photos and Google content

Commons images require verified CC BY, CC BY-SA, CC0 or public-domain metadata.
Author, licence and canonical file source accompany the image. Noncommercial,
unknown or ambiguous licences are rejected. upload.wikimedia.org and the current
thumb.wikimedia.org thumbnail host are allowed; unrelated hosts and suffix spoofs
are rejected. The frontend displays attribution and recovers from failed images.

Only Google Place IDs are durable Google identity facts. Response ratings, raw
photos, coordinates and place price context expire within 30 days. Google price
context never becomes an activity price or a plan budget. Current cards use
lazy raw photos with all linked authors and Google Maps credit, under an atomic
reservation before the billed call (hard cap 900). Concurrent requests for the
same visible photo share their in-flight response, which is then discarded.
UI Kit's separate allowance guard is retained for optional provider elements.
Uploaded-image/provider-header rendering from frontend #136 is integrated. The photo
spike route is disabled in production and guarded in development.

## Remaining release gates

Counts and readiness must come from fresh local reports/search audits. A large
Place count does not establish planning readiness. Unresolved identity candidates,
missing permanent coordinates and untested browser flows remain explicit release
limitations; this document does not declare product approval.
