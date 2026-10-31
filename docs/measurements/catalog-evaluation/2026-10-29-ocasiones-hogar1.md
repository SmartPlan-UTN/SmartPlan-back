# Evaluación de generación — ocasiones-hogar1 (2026-10-29)

> Histórico: medido sobre la composición anterior (candidatos + Gemini), antes del motor de planificación. El Hogar y las ocasiones ahora viven en el motor; su evaluación es `pnpm eval:plans` (escenarios 42–47).


Set v1, 2 corridas por caso, 60 pedidos. Tags de ocasión en la base: sí.

| Medida | Valor | Base |
|---|---:|---:|
| Puntaje total (0–100) | 80.7 | 76.5 |
| Paradas prohibidas | 0 % | 0.5 % |
| Sin resultado (NO_VALID_COMBINATIONS) | 5 % | 3.3 % |
| Pedidos fallidos | 5 % | 3.3 % |
| Latencia p50 / p95 | 2873 / 3523 ms | 3096 / 3747 ms |

## Por caso

| # | Pedido | Puntaje | Base | Ocasión | Prohibidos | Presupuesto | Hogar | Diversidad | Fallidos |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | plan romántico con mi novia | 64.7 | 69.1 | 14 | 100 | — | 100 | 100 | 0/2 |
| 2 | aniversario con mi esposa, algo especial a la noche | 100 | 79.4 | 100 | 100 | — | 100 | 100 | 0/2 |
| 3 | salida barata en pareja | 95 | 95 | 100 | 100 | 100 | 100 | 50 | 0/2 |
| 4 | una cita tranquila para conversar | 91.8 | 61.2 | 80 | 100 | — | 100 | 100 | 0/2 |
| 5 | algo gratis con amigos un sábado | 100 | 91.7 | 100 | — | 100 | — | 100 | 0/2 |
| 6 | noche de juegos en casa con 6 personas | 100 | 41.2 | 100 | 100 | — | 100 | 100 | 0/2 |
| 7 | juntada en casa con amigos sin gastar | 93.3 | 26.7 | 100 | — | 100 | 100 | 50 | 0/2 |
| 8 | con los nenes un domingo de lluvia | 62.5 | 80 | 25 | 100 | — | — | 100 | 0/2 |
| 9 | plan en familia con chicos de 8 y 10 años | 100 | 91.8 | 100 | 100 | — | 100 | 100 | 0/2 |
| 10 | aventura en montaña | 16.7 | 41.7 | 0 | — | — | 100 | 50 | 1/2 |
| 11 | rafting y adrenalina en Potrerillos | 52.9 | 52.9 | 0 | 100 | — | 100 | 50 | 0/2 |
| 12 | recorrer bodegas en Luján de Cuyo | 92.5 | 94.1 | 82 | 100 | — | 100 | 100 | 0/2 |
| 13 | tarde de museos en el centro | 91.8 | 100 | 80 | 100 | — | 100 | 100 | 0/2 |
| 14 | salir a bailar con amigas | 58.8 | 52.9 | 0 | 100 | — | 100 | 100 | 0/2 |
| 15 | after office con compañeros de trabajo | 75.3 | 75.3 | 40 | 100 | — | 100 | 100 | 0/2 |
| 16 | algo para hacer solo un domingo a la tarde | 93.1 | 100 | 83 | 100 | — | 100 | 100 | 0/2 |
| 17 | cumpleaños con 15 amigos | 100 | 100 | — | 100 | — | 100 | 100 | 0/2 |
| 18 | desayuno y paseo tranquilo por el parque | 100 | 100 | 100 | 100 | — | 100 | 100 | 0/2 |
| 19 | tarde al aire libre con amigos y mate | 91.7 | 92.9 | 83 | 100 | — | — | 100 | 0/2 |
| 20 | día de spa y relax en pareja | 0 | 0 | — | — | — | — | — | 2/2 |
| 21 | escapada de día a Cacheuta | 33.3 | 65 | 0 | — | — | 100 | 50 | 0/2 |
| 22 | algo cultural a la noche | 100 | 100 | 100 | 100 | — | 100 | 100 | 0/2 |
| 23 | plan económico con mi familia, tenemos poca plata | 100 | 94.1 | 100 | 100 | 100 | — | 100 | 0/2 |
| 24 | tengo una hora libre en el centro | 90 | 100 | — | 100 | — | 100 | 50 | 0/2 |
| 25 | algo tranquilo en casa con mi pareja | 100 | 41.2 | 100 | 100 | — | 100 | 100 | 0/2 |
| 26 | tarde de lluvia con amigos | 58.3 | 90 | 17 | 100 | — | — | 100 | 0/2 |
| 27 | salida tranqui con mis viejos | 100 | 100 | 100 | 100 | — | 100 | 100 | 0/2 |
| 28 | primera cita, algo casual | 100 | 100 | 100 | 100 | — | 100 | 100 | 0/2 |
| 29 | sorpresa | 100 | 100 | — | — | — | 100 | 100 | 0/2 |
| 30 | comer sushi en el centro | 58.8 | 58.8 | 0 | 100 | — | 100 | 100 | 0/2 |

## Paradas prohibidas encontradas

