# Dominio y trazabilidad

## Convenciones de lenguaje

El dominio se escribe en español para preservar la trazabilidad entre el
entregable académico, los casos de uso y el código.

| Capa               | Convención                      | Ejemplo                  |
| ------------------ | ------------------------------- | ------------------------ |
| Tabla / entidad    | español, `snake_case`, singular | `plan_detail`           |
| Clase TypeScript   | español, `PascalCase`           | `DetallePlan`            |
| Archivo            | `kebab-case` con sufijo técnico | `detalle-plan.entity.ts` |
| Ruta HTTP          | español, `kebab-case`, plural   | `/api/detalle-planes`    |
| Función / variable | `camelCase`                     | `calcularCostoPlan()`    |

No se traducen entidades al inglés. Por ejemplo, `plan` no debe convertirse en
`Itinerary`.

## Entidades por área

| Área                    | Entidades                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| Usuarios y acceso       | `usuario`, `rol`, `permiso`, `role_permission`, `user_session`, `user_status`, `user_preference` |
| Catálogo                | `actividad`, `categoria`, `activity_category`, `category_status`, `lugar`, `activity_place`       |
| Planes                  | `plan`, `plan_detail`, `plan_status`, `plan_request`                                               |
| Feedback                | `feedback`, `feedback_status`, `rating`                                         |
| Colecciones y favoritos | `coleccion`, `favorite_collection`, `favorite_list`, `favorite_activity`, `favorite_plan`            |
| Integración externa     | `external_provider`, `external_sync`                                                         |
| Sistema                 | `notification`, `system_parameter`, `audit_log`                                             |

El diagrama con atributos está en el Anexo N. 5 del documento académico. No se
deben deducir atributos ni relaciones a partir de estos nombres: verificá el
material funcional antes de modelarlos.

## Casos de uso

Los 62 CU están agrupados en diez áreas: autenticación y acceso (CU1-CU4),
gestión de usuarios (CU5-CU8), búsqueda y exploración (CU9-CU16), recomendación
(CU17-CU23), planificación (CU24-CU31), colección (CU32-CU38), favoritos
(CU39-CU43), ratinges (CU44-CU47), integración externa (CU48-CU52) y
administración (CU53-CU62).

La tabla completa de CU, descripción, entidades y pantallas está en
[`skills/01-domain/SKILL.md`](../skills/01-domain/SKILL.md). El estado de
implementación se consulta en GitHub Issues, no en esta documentación.

## Cadena de trazabilidad

```text
Módulo -> CU -> US -> entidades -> pantalla -> código -> pruebas
```

Todo commit y pull request que implemente una funcionalidad debe mencionar el
CU correspondiente. Un caso de uso no se considera finalizado sin una prueba
del camino feliz.

## Glosario

| Término            | Definición                                                         |
| ------------------ | ------------------------------------------------------------------ |
| Plan               | Conjunto ordenado de actividades que forma una experiencia social. |
| Detalle de plan    | Ítem de un plan con actividad, horario y costo estimado.           |
| Solicitud de plan  | Parámetros enviados para generar un plan.                          |
| Actividad          | Experiencia concreta del catálogo.                                 |
| Lugar              | Ubicación física donde se realiza una actividad.                   |
| Colección          | Agrupación de actividades creada por una persona usuaria.          |
| Lista de favoritos | Guardado rápido de actividades y planes.                           |
| Retroalimentación  | Feedback posterior que alimenta recomendaciones.                   |
