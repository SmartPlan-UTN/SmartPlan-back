# Mendoza v2 — product QA (local)

> Historical snapshot from 2026-10-29, not a sign-off of the current branch.
> The landing no longer has context chips; occasions filtering was restored
> in the 2026-10-31 review fixes. Current validation is in TRACKING.md.
> Initial-load batches and current engine score/latency gates remain pending;
> see docs/catalog.md, Delivery status.

2026-10-29, local API on `smartplan_mendoza` (Mendoza v2 occasions + Hogar
batch 1) and the front branch `feature/210-catalogo-ampliado`, Chrome
headless at 1366×900 and 390×844. Nothing was approved or discarded.

| Check | Result |
|---|---|
| Review queue, desktop and mobile | 3 pending monthly-refresh candidates; tabs with counts; place, price source, duration, people, occasion pills, "Fuente sin verificar" warnings; detail with what the place offers; edit dialog with vocabulary chips; discard refuses an empty reason |
| "plan romántico con mi novia" | En pareja understood; plaza, teatro and café plans in Ciudad de Mendoza; no ÑAM |
| "noche de juegos en casa con 6 personas" + En casa | only Hogar games (juegos de mesa, generala, mímica, palabra prohibida); no map pins; total "Gratis" |
| "con los nenes un domingo de lluvia" | En familia, Con niños, Bajo techo; museums suited to children |
| "plan económico con mi familia" + Gratis | parks, plazas and free games at home |
| Explorar `?occasions=romantic&free=true` | filters survive the reload; En pareja and Gratis pressed |
| Hogar detail (El impostor) | "En casa / donde estén", no address or map, 4 a 15 personas, desde 10 años, materials, rules source |
| A place without activities | answers 404 and is absent from the map (e2e) |

Found and fixed during QA: the landing hero hid every context chip, so "En
casa" and "Gratis" now show there alone; candidate filters in one row on
desktop; "1 persona"; an all-free plan reads "Gratis"; Hogar wording.

Pending: review a real initial-load batch (P1) once the proposals exist.
