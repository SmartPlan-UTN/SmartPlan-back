# Discovery pivot and decision-grade plans — 17 October 2026

**Status: large, measurable improvement; not yet "SmartPlan knows Mendoza".** Local only: no push, merge, deploy or remote database. Google spend: **USD 0**. The only paid-tier calls were Place Details Enterprise checks inside the free share and SmartPlan's monthly cap; the ledger shows 166 hours checks, 42 location checks, 31 UI Kit loads and 6 identity lookups this month. Every discovery search used the free, unlimited *Text Search Essentials (IDs Only)* SKU. Gemini ran on a dummy key throughout, using the local intent fallback.

## What changed

| Layer | Before | Now |
|---|---|---|
| Discovery identity | 413 published Places, 282 with coordinates, 11 bars | **1,701 located Places** (1,422 new from an isolated ODbL layer of 2,671 OSM elements, 32 duplicate OSM elements merged) |
| Google identity | 325 IDs; some were wrong branches (two Starbucks shared one ID) | **906 branch-accurate links**: a 250 m restricted name search that an independent name + department search must confirm. 128 earlier links were corrected, 29 duplicate Places merged, 321 fuzzy or closed matches rejected |
| Discovery index | none | **6,662 Google Place IDs** from 516 zone × category cells and live intent searches (IDs only, SmartPlan's own cells, no ranking stored); 977 resolved to Places |
| Query time | local rows only, pool cut at 900 rows ordered by id | Live ID-only search for the person's idea ("bar con onda", "vermutería Potrerillos…") as a request-scoped relevance signal; pool of 3,000 rows |
| Decision gate | best plan could contain "Sin precio" / "Horario sin confirmar" | **Decision-grade** = known opening state for that day + usable price (+ upper bound within a strict budget). The best plan must be decision-grade when any plan is; alternatives under it must be too; optional extras must be. Serious unresolved candidates are verified live **before** solving (≤5 per request); the recommended plan gets ≤2 more checks for its own stops |
| Context | "con onda" = lively; Mr.dog could win | New traits (trendy, traditional, cocktails, sharing_food, fast_food, dessert_focus) from OSM tags (`OPEN_DATA`), name formats, menus and live relevance. Fast-food and hot-dog counters score against "con onda" |
| Menus | one dinner recipe | Semantic roles (BEER, COCKTAIL, WINE, SHAREABLE, COFFEE, PASTRY…); intent-shaped baskets (pints and shared food for friends; a starter, two mains and wine for a date; coffee and something sweet for merienda); a representative real order; "what can we order with $X"; menu features; dish matching ("sushi", "vermú") |
| Result UI | three similar cards with warnings | **Editorial hero** ("Tu mejor plan", story title, price/party/time/travel strip, timeline with purpose, price + source/age, open-until, fit, "Qué podrían pedir", "SmartPlan descartó por vos" from real counts), compact alternatives, refinement on the landing flow |

## Canary suite (`pnpm discovery canaries`)

All six are **discovered** by free intent queries: La Feliz, Flores en Fuego and Barijho appear for "bar con onda Mendoza"; Refugio Patagonia for "cervecería"; Burgang for "hamburguesas con amigos".

| Canary | Durable SmartPlan Place | Why |
|---|---|---|
| La Central Vermutería | **Yes** (#1128). It wins "Vermú y algo para picar" on evidence, and is the alternative for the date-night test | In OSM; branch-confirmed Google link |
| Barijho | One branch (OSM, 2019 position) | The current branch's site disallows bots in robots.txt; Google content cannot be stored |
| Burgang | **No** | Google-only; its "website" is a WhatsApp link |
| La Feliz | **No** | Google-only; no website |
| Flores en Fuego | **No** | Official page publishes no verifiable address |
| Refugio Patagonia | **No** | Google-only; the official route did not verify |

**Product boundary:** under the binding rules (only Place IDs may be stored from Google; OSM lacks these venues; no official identity), these venues can be found and verified live but cannot be persisted as stops with a name. Proposed next step, needing a decision: persist an ID-only Place (SmartPlan label, Place ID, no Google content) and render its name/details with Google's own Places UI Kit element. The front already ships that element.

## Rendered acceptance (real login, real composer, isolated build at 127.0.0.1:3017 → API 3016)

Screenshots and page text: `rendered/core`, `rendered/suite`, `rendered/pass2`–`pass4` (desktop 1440, mobile 390).

| Request | Best plan | Decision-grade |
|---|---|---|
| Novia, con onda, comer bien y tomar algo, $80.000 | Los Laureles / Gingger → Berlina (Arístides) | Hours + prices yes; **budget not provable** with Google's per-person brackets ($60–100k for two). Stated honestly, not claimed |
| 4 amigos, informal + cerveza | Gingger → Chachingo Arístides / Nani Bodegón → Brader Hops | Yes (after the worker-env and best-plan-checks fixes; failed in two earlier runs) |
| Cena premium y romántica | Centauro Restaurant | Yes |
| Merendar lindo con mi novia | Casa Entre Dos / Casa de café | Yes |
| Algo divertido que no sea comer | Casino / amusement venue | **No**: entertainment entry prices are not available from any permitted source yet |
| Con onda para tomar algo | Berlina / Devas | Yes |
| Vermú y algo para picar | **La Central Vermutería** | Yes |
| Cervecería con música | Chachingo Arístides | Yes |
| Cena romántica para dos | La Lucía | Yes |
| Una cena premium | Fuente y Fonda / Centauro | Yes |
| Comer barato | ÑAM Gourmet (official menu prices) | Yes |
| Merienda linda | Casa de café | Yes |
| Qué hacemos esta noche | Liniers Fuegos | Yes |
| Qué hacemos ahora | Fuente y Fonda (lunch, by time) | Yes |
| Plan de pareja en Chacras | El Mercadito → Willis Bar / Bianco y Nero → La Gloria (in Chacras) | Yes |
| Algo para hacer en Potrerillos | Posta Potrerillos / Entre Montañas (in Potrerillos) | Yes, but lunch only: **zero rafting/kayak offerings exist** |
| Algo con adrenalina | Bike-and-tasting offering, Perdriel | Yes, but adventure supply is one or two offerings |
| Plan en Valle de Uco | Lunch (Tranvía) | Yes, thin: wineries need real offerings |
| Plan de día entero | Lunch only | Thin |
| Cine y cena | Cinemark screening + dinner | **No**: no ticket price from the official source |
| Plan familiar | Heladería | **No** |
| Algo cultural | Estación Cultural Ciudad | **No** (hours/price) |

The four "No" rows are not decorated with fake values. They are coverage gaps in permitted price and hours evidence for entertainment, culture, family and cinema.

## Coverage by zone (located Places; "a/b" = total / with branch-accurate Google identity, i.e. live-verifiable)

| Zone | Restaurants | Bars, breweries, clubs | Cafés, bakeries, ice cream | Culture | Fun, wellness, adventure | Wineries |
|---|---|---|---|---|---|---|
| Ciudad de Mendoza | 257/133 | 53/29 | 222/119 | 59 | 13 | 1 |
| Godoy Cruz | 52/25 | 16/7 | 62/35 | 11 | 7 | 2 |
| Guaymallén | 63/25 | 5/4 | 65/28 | 11 | 3 | 3 |
| Valle de Uco | 38/17 | 4/1 | 19/14 | 11 | 4 | 37 |
| Luján (other) | 34/13 | 10/7 | 21/10 | 6 | 0 | 32 |
| Maipú | 35/17 | 8/6 | 13/9 | 18 | 4 | 22 |
| Las Heras | 27/15 | 8/4 | 27/10 | 11 | 1 | 0 |
| San Rafael | 22/10 | 8/4 | 19/11 | 15 | 5 | 2 |
| Chacras | 26/9 | 4/1 | 16/5 | 2 | 0 | 6 |
| Potrerillos–Cacheuta | 26/14 | 1/0 | 5/3 | 0 | 1 | 0 |

**Still critical:** nightlife outside Ciudad/Godoy Cruz (Valle de Uco 1, Chacras 1, Potrerillos 0 live-verifiable bars). Durable decision-grade evidence is still small: 16 venues with fresh official hours and 6 with fresh official menus. Most decision-grade plans depend on live checks, so the free Enterprise allowance (1,000/month, app cap 300 for hours) supports roughly 40–60 generations per month at up to 7 checks each. That is enough for QA, **not for production traffic**.

## Compliance decisions to confirm

1. **OSM as an ODbL identity layer** (you chose this). Merging and deduplicating SmartPlan Places with OSM makes the identity layer (name, coordinates, kind) an ODbL derivative: share-alike plus attribution. SmartPlan-owned hours, prices, menus, traits and Google IDs stay independent properties; OSM `opening_hours` are not used as facts. Needs legal sign-off before production.
2. **No Google content in saved plans** (`PLANNING_PERSIST_PROVIDER_FACTS` off). Live hours and price ranges decide the plan, but saved plans keep only SmartPlan's verdict ("Abierto a esa hora · verificado hoy en Google Maps", budget status) and the Place ID. Google's own UI Kit element shows Google's price and rating, with attribution. Consequence: the hero shows "Precios verificados hoy", not "$40.000–$60.000", unless the price comes from an official menu.
3. **Live discovery** stores Google Place IDs plus SmartPlan cell names only, never Google's order or content.

## Verification

- Backend: full unit suite **1,004 passed, 0 failed** (5 skipped). New focused suites cover decision grade, brand dedupe, menu intelligence, OSM mapping and live queries. Build and lint pass.
- Frontend: typecheck and lint clean; 1,027 tests plus 5 new hero-card tests pass; isolated build `.next-pivot`.
- Migration `1792000000004-AddDiscoveryIndex` was applied to local `smartplan_planning` only.

## Not done

- Google-only venues as plannable stops (decision above).
- Entertainment, culture, cinema and family pricing from official sources. Fudo (`menu.fu.do`), the most frequent menu platform, needs a terms review; its data sits behind a private SPA API.
- Rafting, kayak and winery offerings at breadth (no offering-acquisition pipeline yet).
- Full-day itineraries; the e2e suites were not re-run.
