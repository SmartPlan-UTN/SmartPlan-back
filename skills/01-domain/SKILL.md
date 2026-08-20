---
name: smartplan-domain
description: Entidades del modelo de datos, los 62 casos de uso, pantallas y glosario. Consultar antes de nombrar tablas, endpoints, rutas o componentes.
---

# SmartPlan — Modelo de dominio

> Núcleo compartido. Este archivo es idéntico en `SmartPlan-front` y `SmartPlan-back`.
> Si lo modificás, replicá el cambio en el otro repositorio.

## Regla de nombres

La matriz de trazabilidad conserva el vocabulario funcional en español, pero el
código usa equivalentes técnicos en inglés. Mantené una traducción única y
consistente entre frontend, backend, API y base de datos.

| Capa | Convención | Ejemplo |
|---|---|---|
| Tablas / entidades | inglés, `snake_case`, singular | `plan_detail` |
| Clases TypeScript | inglés, `PascalCase` | `PlanDetail` |
| Rutas de API | inglés, `kebab-case`, plural | `/api/plan-details` |
| Variables y funciones | inglés, `camelCase` | `calculatePlanCost()` |

No inventes sinónimos distintos para el mismo concepto. Un `plan` sigue siendo
`Plan`; `usuario` se implementa como `User`, `actividad` como `Activity` y
`retroalimentación` como `Feedback`.

## Entidades

**37 tablas.** Los nombres y los atributos salen del **diagrama de clases**
(Anexo Nº5). Donde el diagrama y la matriz de trazabilidad no coinciden, manda
el diagrama: es el modelo de datos aprobado.

`reporte` y `tipo_reporte` figuran en el diagrama pero **quedaron fuera del
alcance**: los reportes REP-01 y REP-02 se resuelven consultando el resto del
modelo, sin tablas propias.

### Usuarios y acceso
`usuario` · `rol` · `permiso` · `role_permission` · `user_status` ·
`user_preference` · `user_session` · `recuperacion_contrasena`

### Catálogo
`actividad` · `categoria` · `activity_category` · `category_status` ·
`activity_place`

### Ubicación
`lugar` · `departamento` · `ciudad` · `pais`

### Planes
`plan` · `plan_detail` · `plan_status` · `plan_request` ·
`plan_request_category` · `request_status` · `outing_type`

### Retroalimentación
`feedback` · `feedback_status` · `rating`

### Colecciones y favoritos
`coleccion` · `favorite_collection` · `favorite_list` · `favorite_activity` ·
`favorite_plan`

### Integración externa
`external_provider` · `external_sync`

### Sistema
`notification` · `system_parameter` · `audit_log`

Están implementadas en `SmartPlan-back`, en `src/<módulo>/entities/*.entity.ts`.
Los atributos de cada una se leen ahí: cada entidad tiene el comentario de qué
representa y qué CU la usa.

### Lo que hay que tener presente del modelo

Tres decisiones no se deducen solamente de los nombres:

1. **`rating` cuelga de `actividad`.** La matriz de trazabilidad, CU44 y
   PAN 18 definen que se puntúa cada actividad; la retroalimentación puede
   agrupar varios puntajes de una experiencia.
2. **Todo `plan` tiene `id_usuario`.** Los planes generados también conservan
   `id_plan_request`; en los creados a mano (CU24) esa relación es nula, pero
   nunca quedan sin dueño.
3. **Las coordenadas están en `activity_place`, no en `lugar`.** El punto de
   encuentro depende de la actividad: la entrada de la bodega no es el sector de
   la degustación.

> Del Anexo Nº5 quedó una sola clase sin nombre legible en la exportación del
> PDF: el catálogo al que apunta `plan_request.id_outing_type`. Está
> implementada como `outing_type`.

## Casos de uso

62 casos de uso agrupados en 10 módulos.

### Autenticación y control de acceso
| CU | Descripción |
|---|---|
| CU1 | Iniciar sesión |
| CU2 | Registrar usuario |
| CU3 | Recuperar contraseña |
| CU4 | Cerrar sesión |

### Gestión de usuarios
| CU | Descripción |
|---|---|
| CU5 | Editar perfil |
| CU6 | Cambiar contraseña |
| CU7 | Eliminar cuenta |
| CU8 | Editar preferencias |

### Búsqueda y exploración
| CU | Descripción |
|---|---|
| CU9 | Buscar actividades |
| CU10 | Filtrar resultados |
| CU11 | Ordenar resultados |
| CU12 | Buscar planes |
| CU13 | Consultar plan |
| CU14 | Consultar actividad |
| CU15 | Guardar actividad |
| CU16 | Visualizar actividades en mapa |

### Recomendación
| CU | Descripción |
|---|---|
| CU17 | Generar plan automático |
| CU18 | Personalizar preferencias de usuario |
| CU19 | Generar plan sorpresa |
| CU20 | Mostrar recomendaciones |
| CU21 | Ajustar recomendaciones según historial |
| CU22 | Seleccionar plan |
| CU23 | Registrar retroalimentación del plan |

### Planificación
| CU | Descripción |
|---|---|
| CU24 | Crear plan |
| CU25 | Editar plan |
| CU26 | Eliminar plan |
| CU27 | Agregar actividad al plan |
| CU28 | Quitar actividad de plan |
| CU29 | Visualizar plan |
| CU30 | Calcular costo del plan |
| CU31 | Generar plan sugerido |

### Colección
| CU | Descripción |
|---|---|
| CU32 | Crear colección |
| CU33 | Editar colección |
| CU34 | Eliminar colección |
| CU35 | Agregar actividad a colección |
| CU36 | Quitar actividad de colección |
| CU37 | Ver detalle de colección |
| CU38 | Ver colección |

### Favoritos
| CU | Descripción |
|---|---|
| CU39 | Ver actividades guardadas |
| CU40 | Ver planes guardados |
| CU41 | Quitar actividad guardada |
| CU42 | Quitar plan guardado |
| CU43 | Guardar plan favorito |

### Valoraciones
| CU | Descripción |
|---|---|
| CU44 | Valorar actividad |
| CU45 | Ver ratinges |
| CU46 | Editar valoración |
| CU47 | Eliminar valoración |

### Integración externa
| CU | Descripción |
|---|---|
| CU48 | Obtener datos de lugares |
| CU49 | Sincronizar información externa |
| CU50 | Actualizar datos de actividades |
| CU51 | Registrar datos externos utilizados |
| CU52 | Obtener ratinges externas |

### Administración
| CU | Descripción |
|---|---|
| CU53 | Gestionar actividades |
| CU54 | Gestionar categorías |
| CU55 | Moderar ratinges |
| CU56 | Eliminar contenido |
| CU57 | Administrar usuarios |
| CU58 | Visualizar métricas del sistema |
| CU59 | Revisar sugerencia de usuario |
| CU60 | Gestionar planes |
| CU61 | Gestionar permisos |
| CU62 | Gestionar roles |

## Pantallas

Las pantallas se identifican como `PAN NN`. Las que aparecen en la matriz de
trazabilidad:

| Pantalla | Casos de uso asociados |
|---|---|
| PAN 07 — Home | CU17 |
| PAN 08 — Búsqueda por mapa | CU16 |
| PAN 09 — Función sorpréndeme | CU19 |
| PAN 10 — Planes recomendados | CU12, CU20 |
| PAN 11 — Resultados de búsqueda | CU9, CU10, CU11, CU12, CU22, CU43 |
| PAN 12 — Ver favoritos | CU39, CU40, CU15, CU41, CU42, CU43 |
| PAN 13 — Ver historial | CU23 |
| PAN 14 — Editar perfil | CU5, CU7 |
| PAN 15 — Editar preferencias | CU8 |
| PAN 17 — Consultar plan | CU13, CU22, CU23, CU25, CU26, CU27, CU28, CU29, CU30, CU43 |
| PAN 18 — Consultar actividad | CU14, CU35, CU15, CU44, CU45 |
| PAN 19 — Administrar usuarios | CU57 |
| PAN 20 — Moderar ratinges | CU55 |
| PAN 21 — Gestionar actividades | CU53 |
| PAN 22 — Gestionar Plan | CU60 |

El mapa de navegación completo está en el Anexo Nº7.

## Trazabilidad

Cada funcionalidad tiene la cadena:

```
Módulo → CU (caso de uso) → US (historia de usuario) → entidades → pantalla
```

Ejemplo real de la matriz:

| Tipo | Módulo | Función | CU | US | Entidades | Pantalla |
|---|---|---|---|---|---|---|
| Funcional | Procesos del negocio | Generar plan automático | CU17 | US16 | `plan_request`, `plan`, `plan_detail` | PAN 07 - Home |
| Funcional | Búsqueda y filtrado | Consultar actividad | CU14 | US14 | `actividad`, `activity_place`, `lugar` | PAN 18 |
| Funcional | Colección | Agregar actividad a colección | CU35 | US30 | `favorite_collection`, `coleccion`, `actividad` | PAN 18 |

**Al implementar una funcionalidad, referenciá el CU en el commit y en el PR.**
Eso mantiene la trazabilidad que exige la documentación del proyecto.

## Reportes definidos

- **REP-01 — Panel de Control General**: KPIs (total de usuarios, planes activos,
  actividades en catálogo, ratinges pendientes), tasa de aceptación,
  valoración promedio, retención, distribución por estado de ánimo y tamaño de
  grupo, actividades más populares, actividad reciente.
- **REP-02 — Administración de Usuarios**: métricas de encabezado (total, activos
  hoy, nuevos registros), tabla de usuarios con filtros por estado
  (Activo / Suspendido / Baneado).

## Glosario

| Término | Significado |
|---|---|
| **Plan** | Conjunto ordenado de actividades que conforma una experiencia social |
| **Detalle de plan** | Cada ítem del plan: una actividad con su horario y costo estimado |
| **Solicitud de plan** | Los parámetros que el usuario envía para generar un plan (presupuesto, zona, tiempo, tipo de salida) |
| **Plan sorpresa** | Plan generado sin que el usuario fije todos los parámetros |
| **Actividad** | Experiencia concreta del catálogo (ej.: "Ruta del vino en Luján de Cuyo") |
| **Lugar** | Ubicación física donde se realiza una actividad |
| **Colección** | Agrupación de actividades armada por el usuario |
| **Lista de favoritos** | Guardado rápido de actividades y planes |
| **Retroalimentación** | Feedback posterior a la experiencia, alimenta las recomendaciones |
