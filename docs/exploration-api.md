# Contrato de búsqueda y exploración

Contrato HTTP implementado para CU9-CU14 y CU16. Todas las rutas usan el
prefijo global `/api`, los nombres técnicos y las respuestas están en inglés, y
los mensajes visibles de error permanecen en español.

## Endpoints

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/api/activities` | Buscar, filtrar, ordenar y paginar actividades |
| `GET` | `/api/activities/map` | Obtener marcadores dentro de un viewport |
| `GET` | `/api/activities/:id` | Consultar el detalle de una actividad |
| `GET` | `/api/plans` | Buscar, filtrar, ordenar y paginar planes |
| `GET` | `/api/plans/:id` | Consultar un plan y su itinerario ordenado |
| `GET` | `/api/categories` | Listar categorías activas para filtros |
| `GET` | `/api/places` | Buscar lugares y filtrar por departamento |
| `GET` | `/api/places/:id` | Consultar un lugar y su jerarquía geográfica |

CU15 pertenece al módulo de favoritos. No forma parte de estos endpoints porque
guardar una actividad requiere autenticar al usuario y comprobar que sea dueño
de la lista de favoritos.

## Consulta de actividades y planes

`GET /activities` y `GET /plans` aceptan:

| Parámetro | Tipo | Regla |
|---|---|---|
| `search` | string | Texto libre, entre 1 y 200 caracteres |
| `categoryIds` | integer[] | IDs separados por coma o parámetros repetidos |
| `type` | string | En actividades busca `activity.type`; en planes busca el `outing_type` |
| `minPrice` / `maxPrice` | decimal | Valores no negativos; el mínimo no supera al máximo |
| `minRating` | decimal | Entre 1 y 5 |
| `latitude` / `longitude` | decimal | Origen para distancia |
| `maxDistanceKm` | decimal | Radio entre 0,1 y 500 km |
| `sortBy` | enum | `relevance`, `price`, `rating` o `distance` |
| `direction` | enum | `asc` o `desc`; aplica al precio |
| `page` | integer | Desde 1, valor predeterminado 1 |
| `limit` | integer | Entre 1 y 100, valor predeterminado 20 |

El orden por distancia requiere `latitude` y `longitude`. El filtro por radio
requiere además `maxDistanceKm`. La distancia se calcula en PostgreSQL mediante
Haversine sobre las coordenadas de `activity_place`; no requiere PostGIS.

La relevancia actual es textual y determinista: coincidencia exacta, prefijo y
contenido. La búsqueda semántica con IA pertenece al motor de recomendación y
puede reemplazar ese puntaje sin cambiar el contrato HTTP.

Todos los órdenes agregan `id` como desempate estable.

Las categorías inactivas no se devuelven ni participan de los filtros. Las
valoraciones promedio se redondean a dos decimales en listados y detalles.

## Vista de mapa

`GET /api/activities/map` requiere los límites `south`, `north`, `west` y
`east`. Acepta además los mismos filtros de actividades. Cada elemento de
`data` representa una ubicación de `activity_place`, no solamente una
actividad, porque una actividad puede tener más de un punto de encuentro.

## Respuesta paginada

Todos los listados responden:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 0
  }
}
```

La exploración de planes es una proyección pública de planes no cancelados. No
incluye el propietario, los criterios de la solicitud, notas del usuario, email,
hash de contraseña ni otros campos sensibles. Los endpoints privados de gestión
de planes deberán incorporarse junto con autenticación y autorización.

## Cambios de esquema

La migración `AddActivityTypeAndRenameRatingScore` agrega `activity.type` y
renombra `rating.puntaje` a `rating.score` conservando los datos existentes y la
restricción de valores entre 1 y 5.
