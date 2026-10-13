# Mendoza search QA

Realistic Spanish queries run through the real Explore search (`pnpm catalog search-qa`) against the local Mendoza catalog database. EMPTY = no result, WEAK = fewer than 3. A result count alone is not quality: the top results are listed so wrong matches are visible.

## BEFORE (2026-10-13, catalog as shown in the Explore screenshots)

31 queries, 22 OK, 7 empty, 2 weak.

| Query | Results | Verdict | Top results |
|---|---:|---|---|
| bodega | 121 | OK | Visita y degustación en Bressia Bodega (Visita a bodega); Visita y degustación en Gimenez Riili Bodegas y Viñedos (Visita a bodega); Visita y degustación en Bodega Dante Robino (Visita a bodega); Visita y degustación en Bodega y Viñedo Familia Giaquinta (Visita a bodega); Visita y degustación en Bodega Bombal (Visita a bodega) |
| degustación | 120 | OK | Visita y degustación en Don Bosco (Visita a bodega); Visita y degustación en Benvenuto de la Serna (Visita a bodega); Visita y degustación en Pulenta Estate (Visita a bodega); Visita y degustación en Salentein/killka (Visita a bodega); Visita y degustación en Oscar Alberto Cecchin (Visita a bodega) |
| vino | 121 | OK | Visita y degustación en Don Bosco (Visita a bodega); Visita y degustación en Benvenuto de la Serna (Visita a bodega); Visita y degustación en Pulenta Estate (Visita a bodega); Visita y degustación en Salentein/killka (Visita a bodega); Visita y degustación en Oscar Alberto Cecchin (Visita a bodega) |
| café | 20 | OK | Tomar un café en Mikelinos (Comida); Tomar un café en El Hornero (Comida); Tomar un café en El Duende (Comida); Tomar un café en Ristretto (Comida); Tomar un café en Bonafide (Comida) |
| merienda | 0 | EMPTY |  |
| brunch | 0 | EMPTY |  |
| hamburguesa | 0 | EMPTY |  |
| sushi | 1 | WEAK | Comer en Sushi Club (Comida) |
| cerveza artesanal | 1 | WEAK | Comer en Antares Brew Pub (Comida) |
| bar | 19 | OK | Tomar un café en Nina Café Bar (Comida); Tomar un café en Mirador de Café & Copas (Comida); Comer en Gingger Bar (Comida); Salir a tomar algo en Tibet Bar (Salida); Salir a tomar algo en Los Puquios (Salida) |
| boliche | 0 | EMPTY |  |
| museo | 8 | OK | Visitar el Museo del Área Fundacional (Museo); Visitar el Museo Municipal de Arte Moderno (Museo); Visitar el Museo de Ciencias Naturales Juan Cornelio Moyano (Museo); Visitar el Museo del Pasado Cuyano (Museo); Visitar el Museo Histórico General San Martín (Museo) |
| teatro | 3 | OK | Ver un espectáculo en el Teatro Independencia (Espectáculo); Pasear por la Plaza Independencia (Paseo urbano); Subir al Cerro de la Gloria (Mirador) |
| cultura | 0 | EMPTY |  |
| parque | 27 | OK | Pasear por el Parque General San Martín (Paseo al aire libre); Pasear por la Plaza Independencia (Paseo urbano); Pasear por la Plaza España (Paseo urbano); Pasear por la Plaza Chile (Paseo urbano); Pasear por la Plaza Italia (Paseo urbano) |
| gratis | 16 | OK | Pasear por el Parque General San Martín (Paseo al aire libre); Pasear por la Plaza Independencia (Paseo urbano); Pasear por la Plaza España (Paseo urbano); Pasear por la Plaza Chile (Paseo urbano); Pasear por la Plaza Italia (Paseo urbano) |
| barato | 0 | EMPTY |  |
| niños | 8 | OK | Visita y degustación en Luigi Bosca/familia Arizu (Visita a bodega); Visita y degustación en Familia Otero Ramos (Visita a bodega); Visita y degustación en Familia Ibarra (Visita a bodega); Visita y degustación en Bodega y Viñedo Familia Giaquinta (Visita a bodega); Visita y degustación en Bodega Dos Familias (Visita a bodega) |
| pareja | 0 | EMPTY |  |
| trekking | 18 | OK | Trekking con Raffeish (Trekking); Trekking con Grajales Fernando Expeditions (Trekking); Trekking con Argentina Rafting Expediciones (Trekking); Trekking con Alihuen (Trekking); Trekking con Way Out Adventures (Trekking) |
| senderismo | 18 | OK | Caminata a la Laguna de Horcones (Aconcagua) (Trekking); Cabalgata y trekking en Potrerillos (Cabalgata); Trekking con Raffeish (Trekking); Trekking con Grajales Fernando Expeditions (Trekking); Trekking con Argentina Rafting Expediciones (Trekking) |
| montaña | 13 | OK | Comer en Cantina de Montaña (Comida); Comer en Los Negritos Bodegon de Montaña (Comida); Visitar Puente del Inca (Excursión); Esquiar en Los Penitentes (Esquí); Visitar la Reserva Natural Villavicencio (Excursión) |
| rafting | 24 | OK | Rafting en el río Mendoza (Potrerillos) (Rafting); Rafting en el Cañón del Atuel (Rafting); Rafting con Saint Joseph (Rafting); Rafting con Rios Andinos White Raftin (Rafting); Rafting con Raffeish (Rafting) |
| cabalgata | 18 | OK | Cabalgata y trekking en Potrerillos (Cabalgata); Cabalgata con Saint Joseph (Cabalgata); Cabalgata con Rios Andinos White Raftin (Cabalgata); Cabalgata con Sport Star (Cabalgata); Cabalgata con El Rincon de los Oscuros (Cabalgata) |
| spa | 3 | OK | Día de termas en Cacheuta (Termas); Visitar Puente del Inca (Excursión); Recorrer el Dique Potrerillos (Mirador) |
| termas | 3 | OK | Día de termas en Cacheuta (Termas); Visitar Puente del Inca (Excursión); Recorrer el Dique Potrerillos (Mirador) |
| Potrerillos | 13 | OK | Comer en Estación Potrerillos (Comida); Rafting en el río Mendoza (Potrerillos) (Rafting); Cabalgata y trekking en Potrerillos (Cabalgata); Recorrer el Dique Potrerillos (Mirador); Cabalgata con El Rincon de los Oscuros (Cabalgata) |
| Chacras | 5 | OK | Visita y degustación en Clos de Chacras (Visita a bodega); Comer en Barrio Chino Chacras (Comida); Visita y degustación en Alta Vista (Visita a bodega); Cabalgata con Los Chulengos (Cabalgata); Trekking con Los Chulengos (Trekking) |
| Maipú | 31 | OK | Tomar un café en Viilage Arena Maipu (Comida); Visita y degustación en Don Bosco (Visita a bodega); Visita y degustación en Oscar Alberto Cecchin (Visita a bodega); Visita y degustación en Viña el Cerno (Visita a bodega); Visita y degustación en Casa del Visitante (Visita a bodega) |
| Valle de Uco | 54 | OK | Visita y degustación en Tupungato Divino (Visita a bodega); Comer en Valle del Tupungato (Comida); Visita y degustación en Bodega Masi Tupungato (Visita a bodega); Visita y degustación en Salentein/killka (Visita a bodega); Visita y degustación en la Azul (Visita a bodega) |
| San Rafael | 61 | OK | Parapente con Parapente San Rafael (Parapente); Visita y degustación en Casa Bianchi (Visita a bodega); Visita y degustación en Algodón Wine Estates (Visita a bodega); Visita y degustación en Labiano (Visita a bodega); Visita y degustación en 1920 (Visita a bodega) |

