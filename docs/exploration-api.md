# Contrato de búsqueda y exploración

Contrato HTTP implementado para CU9-CU14 y CU16. Todas las rutas usan el
prefijo global `/api`, los nombres técnicos y las respuestas están en inglés, y
los mensajes visibles de error permanecen en español.

## Endpoints

| Método | Ruta                  | Uso                                            |
| ------ | --------------------- | ---------------------------------------------- |
| `GET`  | `/api/activities`     | Buscar, filtrar, ordenar y paginar actividades |
| `GET`  | `/api/activities/map` | Obtener marcadores dentro de un viewport       |
| `GET`  | `/api/activities/:id` | Consultar el detalle de una actividad          |
| `GET`  | `/api/plans`          | Buscar, filtrar, ordenar y paginar planes      |
| `GET`  | `/api/plans/:id`      | Consultar un plan y su itinerario ordenado     |
| `GET`  | `/api/categories`     | Listar categorías activas para filtros         |
| `GET`  | `/api/places`         | Buscar lugares y filtrar por departamento      |
| `GET`  | `/api/places/:id`     | Consultar un lugar y su jerarquía geográfica   |

CU15 pertenece al módulo de favoritos. No forma parte de estos endpoints porque
guardar una actividad requiere autenticar al usuario y comprobar que sea dueño
de la lista de favoritos.

## Consulta de actividades

`GET /activities` acepta:

| Parámetro                | Tipo      | Regla                                                             |
| ------------------------ | --------- | ----------------------------------------------------------------- |
| `search`                 | string    | Texto libre, entre 1 y 200 caracteres                             |
| `categoryIds`            | integer[] | IDs separados por coma o parámetros repetidos                     |
| `type`                   | string    | Clave técnica exacta de `activity.type`, normalizada a minúsculas |
| `minPrice` / `maxPrice`  | decimal   | Valores no negativos; el mínimo no supera al máximo               |
| `minRating`              | decimal   | Entre 1 y 5                                                       |
| `latitude` / `longitude` | decimal   | Origen para distancia                                             |
| `maxDistanceKm`          | decimal   | Radio entre 0,1 y 500 km                                          |
| `sortBy`                 | enum      | `relevance`, `price`, `rating` o `distance`                       |
| `direction`              | enum      | `asc` o `desc`; aplica al precio                                  |
| `page`                   | integer   | Desde 1, valor predeterminado 1                                   |
| `limit`                  | integer   | Entre 1 y 100, valor predeterminado 20                            |

`activity.type` es nullable para permitir una carga progresiva. Las actividades
existentes no aparecen al usar este filtro hasta que una importación o una
operación administrativa les asigne una clave técnica. El índice B-tree de la
columna se aprovecha porque el filtro usa igualdad, no búsqueda por contenido.

## Consulta de planes

`GET /plans` acepta los mismos parámetros generales de actividades, excepto
`type`. Para filtrar por el tipo de salida asociado a `plan_request`, usa:

| Parámetro    | Tipo   | Regla                                              |
| ------------ | ------ | -------------------------------------------------- |
| `outingType` | string | Coincide con la clave o el nombre de `outing_type` |

Así, `type` siempre representa `activity.type` y `outingType` siempre representa
el tipo de salida de un plan.

El orden por distancia requiere `latitude` y `longitude`. El filtro por radio
requiere además `maxDistanceKm`. La distancia se calcula en PostgreSQL mediante
Haversine sobre las coordenadas de `activity_place`; no requiere PostGIS.

La relevancia actual es textual y determinista: coincidencia exacta, prefijo y
contenido. La búsqueda semántica con IA pertenece al motor de recomendación y
puede reemplazar ese puntaje sin cambiar el contrato HTTP.

Todos los órdenes agregan `id` como desempate estable.

Las categorías inactivas no se devuelven ni participan de los filtros. Las
valoraciones promedio se redondean a dos decimales en listados y detalles.

## Consulta de categorías

`GET /categories` acepta:

| Parámetro   | Tipo    | Regla                                                  |
| ----------- | ------- | ------------------------------------------------------ |
| `search`    | string  | Busca en nombre y descripción, entre 1 y 80 caracteres |
| `sortBy`    | enum    | `name`                                                 |
| `direction` | enum    | `asc` o `desc`                                         |
| `page`      | integer | Desde 1, valor predeterminado 1                        |
| `limit`     | integer | Entre 1 y 100, valor predeterminado 20                 |

Solo se devuelven categorías activas. Por eso la respuesta no repite un campo
`status` cuyo valor sería siempre `active`.

## Consulta de lugares

`GET /places` acepta:

| Parámetro      | Tipo    | Regla                                                                       |
| -------------- | ------- | --------------------------------------------------------------------------- |
| `search`       | string  | Busca en nombre, dirección, departamento y ciudad; entre 1 y 150 caracteres |
| `departmentId` | integer | ID positivo del departamento                                                |
| `sortBy`       | enum    | `name`                                                                      |
| `direction`    | enum    | `asc` o `desc`                                                              |
| `page`         | integer | Desde 1, valor predeterminado 1                                             |
| `limit`        | integer | Entre 1 y 100, valor predeterminado 20                                      |

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

La migración `AddActivityType` agrega `activity.type` y su índice. La migración
anterior `CompleteSchemaEnglishTranslation`, integrada desde `develop`, es la
responsable de renombrar `rating.puntaje` a `rating.score`.
