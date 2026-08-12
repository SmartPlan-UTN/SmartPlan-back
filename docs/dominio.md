# Dominio y trazabilidad

## Convenciones de lenguaje

El dominio se escribe en español para preservar la trazabilidad entre el
entregable académico, los casos de uso y el código.

| Capa               | Convención                      | Ejemplo                  |
| ------------------ | ------------------------------- | ------------------------ |
| Tabla / entidad    | español, `snake_case`, singular | `detalle_plan`           |
| Clase TypeScript   | español, `PascalCase`           | `DetallePlan`            |
| Archivo            | `kebab-case` con sufijo técnico | `detalle-plan.entity.ts` |
| Ruta HTTP          | español, `kebab-case`, plural   | `/api/detalle-planes`    |
| Función / variable | `camelCase`                     | `calcularCostoPlan()`    |

No se traducen entidades al inglés. Por ejemplo, `plan` no debe convertirse en
`Itinerary`.

## Entidades por área

| Área                    | Entidades                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| Usuarios y acceso       | `usuario`, `rol`, `permiso`, `rol_permiso`, `sesion_usuario`, `estado_usuario`, `preferencia_usuario` |
| Catálogo                | `actividad`, `categoria`, `actividad_categoria`, `estado_categoria`, `lugar`, `actividad_lugar`       |
| Planes                  | `plan`, `detalle_plan`, `estado_plan`, `solicitud_plan`                                               |
| Feedback                | `retroalimentacion`, `estado_retroalimentacion`, `valoracion`                                         |
| Colecciones y favoritos | `coleccion`, `coleccion_favorito`, `lista_favorito`, `actividad_favorito`, `plan_favorito`            |
| Integración externa     | `proveedor_externo`, `sincronizacion_externa`                                                         |
| Sistema                 | `notificacion`, `parametro_sistema`, `registro_auditoria`                                             |

El diagrama con atributos está en el Anexo N. 5 del documento académico. No se
deben deducir atributos ni relaciones a partir de estos nombres: verificá el
material funcional antes de modelarlos.

## Casos de uso

Los 62 CU están agrupados en diez áreas: autenticación y acceso (CU1-CU4),

La tabla completa de CU, descripción, entidades y pantallas está en
[`skills/01-dominio/SKILL.md`](../skills/01-dominio/SKILL.md). El estado de
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
