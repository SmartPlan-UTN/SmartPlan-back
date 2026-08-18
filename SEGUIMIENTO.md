# SEGUIMIENTO — SmartPlan Back

Estado de avance del repositorio. Es la memoria del proyecto entre sesiones: quien
llegue acá (persona o agente de IA) debería poder retomar sin releer todo el
historial de git.

---

## Cómo actualizar este archivo

**Actualizalo cuando termines una tarea, no cuando la empezás.**

1. Buscá la fila del CU o de la tarea en la que trabajaste.
2. Cambiá el **Estado** según la tabla de abajo.
3. Completá **Rama** y **PR**.
4. Si tomaste una decisión técnica que no es obvia leyendo el código, agregala en
   [Decisiones](#decisiones).
5. Agregá una línea en la [Bitácora](#bitácora) con la fecha.

### Estados

| Estado | Significa |
|---|---|
| `No iniciado` | Nadie lo tomó todavía |
| `En progreso` | Hay una rama abierta con trabajo real |
| `En revisión` | PR abierto, esperando las 2 aprobaciones |
| `Finalizado` | Mergeado a `develop` |
| `Bloqueado` | No se puede avanzar; el motivo va en Notas |

### Reglas

- Un CU solo pasa a `Finalizado` cuando el PR está **mergeado**, no cuando está abierto.
- Un CU no se marca `Finalizado` sin al menos un test del camino feliz.
- No borres filas. Si algo se descarta, marcalo `Bloqueado` y explicá por qué.
- Las fechas en formato `AAAA-MM-DD`.

---

## Estado global

| | |
|---|---|
| **Fase** | Scaffold — sin entidades ni módulos de negocio |
| **Rama base** | `develop` |
| **Última actualización** | 2026-08-11 |
| **Casos de uso finalizados** | 0 / 62 |

---

## Infraestructura y configuración

| Tarea | Estado | Rama | PR | Notas |
|---|---|---|---|---|
| Repositorio inicial (starter NestJS) | `Finalizado` | — | — | NestJS 11, TypeORM, driver `pg` |
| Protección de ramas `main` y `develop` | `Finalizado` | — | — | PR obligatorio + 2 aprobaciones |
| Skills y convenciones para agentes de IA | `En progreso` | `docs/skills-agentes-ia` | — | Este archivo y la carpeta `skills/` |
| Conexión a PostgreSQL (TypeORM) | `En progreso` | `23-f01-conectar-typeorm-a-postgresql` | #23 | De Bautista. Se rebasa sobre F02 una vez mergeado; ver Decisiones |
| Variables de entorno + `.env.example` | `En revisión` | `SMART-f02-configuracion-por-variables-de-entorno` | #24 | `ConfigModule` global con validación de esquema al arranque (`src/config/variables-entorno.ts`) |
| `ValidationPipe` global + `class-validator` | `No iniciado` | — | — | `class-validator` todavía no está en dependencias |
| Módulo de autenticación JWT | `No iniciado` | — | — | Cubre CU1–CU4 |
| Migraciones de TypeORM | `No iniciado` | — | — | `synchronize` solo en desarrollo |
| Separar `lint` de `lint:fix` | `Finalizado` | `SMART-f05-separar-los-scripts-lint-y-lintfix` | #27 | Ver `skills/04-calidad/` |
| Unificar criterio de `no-explicit-any` con el front | `Finalizado` | `SMART-f05-separar-los-scripts-lint-y-lintfix` | #27 | Ahora `error`, igual que `SmartPlan-front` |

---

## Casos de uso

Los 62 CU del sistema. La columna **Entidades** viene de la matriz de
trazabilidad del documento (`skills/01-dominio/`).

### Autenticación y control de acceso

| CU | Funcionalidad | Entidades | Estado | Rama | PR |
|---|---|---|---|---|---|
| CU1 | Iniciar sesión | `usuario`, `sesion_usuario` | `No iniciado` | | |
| CU2 | Registrar usuario | `usuario`, `estado_usuario` | `No iniciado` | | |
| CU3 | Recuperar contraseña | `usuario` | `No iniciado` | | |
| CU4 | Cerrar sesión | `sesion_usuario` | `No iniciado` | | |

### Gestión de usuarios

| CU | Funcionalidad | Entidades | Estado | Rama | PR |
|---|---|---|---|---|---|
| CU5 | Editar perfil | `usuario` | `No iniciado` | | |
| CU6 | Cambiar contraseña | `usuario` | `No iniciado` | | |
| CU7 | Eliminar cuenta | `usuario`, `estado_usuario` | `No iniciado` | | |
| CU8 | Editar preferencias | `preferencia_usuario`, `usuario`, `categoria` | `No iniciado` | | |

### Búsqueda y exploración

| CU | Funcionalidad | Entidades | Estado | Rama | PR |
|---|---|---|---|---|---|
| CU9 | Buscar actividades | `actividad` | `No iniciado` | | |
| CU10 | Filtrar resultados | `actividad`, `categoria`, `actividad_categoria` | `No iniciado` | | |
| CU11 | Ordenar resultados | `actividad` | `No iniciado` | | |
| CU12 | Buscar planes | `plan` | `No iniciado` | | |
| CU13 | Consultar plan | `plan`, `detalle_plan`, `actividad` | `No iniciado` | | |
| CU14 | Consultar actividad | `actividad`, `actividad_lugar`, `lugar` | `No iniciado` | | |
| CU15 | Guardar actividad | `actividad_favorito`, `lista_favorito`, `actividad` | `No iniciado` | | |
| CU16 | Visualizar actividades en mapa | `actividad_lugar`, `lugar` | `No iniciado` | | |

### Recomendación

| CU | Funcionalidad | Entidades | Estado | Rama | PR |
|---|---|---|---|---|---|
| CU17 | Generar plan automático | `solicitud_plan`, `plan`, `detalle_plan` | `No iniciado` | | |
| CU18 | Personalizar preferencias de usuario | `preferencia_usuario` | `No iniciado` | | |
| CU19 | Generar plan sorpresa | `solicitud_plan`, `plan`, `detalle_plan` | `No iniciado` | | |
| CU20 | Mostrar recomendaciones | `plan`, `detalle_plan`, `actividad` | `No iniciado` | | |
| CU21 | Ajustar recomendaciones según historial | `retroalimentacion`, `solicitud_plan` | `No iniciado` | | |
| CU22 | Seleccionar plan | `plan` | `No iniciado` | | |
| CU23 | Registrar retroalimentación del plan | `retroalimentacion`, `estado_retroalimentacion`, `solicitud_plan` | `No iniciado` | | |

### Planificación

| CU | Funcionalidad | Entidades | Estado | Rama | PR |
|---|---|---|---|---|---|
| CU24 | Crear plan | `plan`, `detalle_plan` | `No iniciado` | | |
| CU25 | Editar plan | `plan`, `detalle_plan` | `No iniciado` | | |
| CU26 | Eliminar plan | `plan` | `No iniciado` | | |
| CU27 | Agregar actividad al plan | `detalle_plan`, `plan`, `actividad` | `No iniciado` | | |
| CU28 | Quitar actividad de plan | `detalle_plan`, `plan`, `actividad` | `No iniciado` | | |
| CU29 | Visualizar plan | `plan`, `detalle_plan`, `actividad` | `No iniciado` | | |
| CU30 | Calcular costo del plan | `plan`, `detalle_plan`, `actividad` | `No iniciado` | | |
| CU31 | Generar plan sugerido | `solicitud_plan`, `plan`, `detalle_plan` | `No iniciado` | | |

### Colección

| CU | Funcionalidad | Entidades | Estado | Rama | PR |
|---|---|---|---|---|---|
| CU32 | Crear colección | `coleccion` | `No iniciado` | | |
| CU33 | Editar colección | `coleccion` | `No iniciado` | | |
| CU34 | Eliminar colección | `coleccion` | `No iniciado` | | |
| CU35 | Agregar actividad a colección | `coleccion_favorito`, `coleccion`, `actividad` | `No iniciado` | | |
| CU36 | Quitar actividad de colección | `coleccion_favorito`, `coleccion`, `actividad` | `No iniciado` | | |
| CU37 | Ver detalle de colección | `coleccion`, `coleccion_favorito`, `actividad` | `No iniciado` | | |
| CU38 | Ver colección | `coleccion` | `No iniciado` | | |

### Favoritos

| CU | Funcionalidad | Entidades | Estado | Rama | PR |
|---|---|---|---|---|---|
| CU39 | Ver actividades guardadas | `lista_favorito`, `actividad_favorito`, `actividad` | `No iniciado` | | |
| CU40 | Ver planes guardados | `lista_favorito`, `plan_favorito`, `plan` | `No iniciado` | | |
| CU41 | Quitar actividad guardada | `actividad_favorito`, `lista_favorito` | `No iniciado` | | |
| CU42 | Quitar plan guardado | `plan_favorito`, `lista_favorito`, `plan` | `No iniciado` | | |
| CU43 | Guardar plan favorito | `plan_favorito`, `lista_favorito`, `plan` | `No iniciado` | | |

### Valoraciones

| CU | Funcionalidad | Entidades | Estado | Rama | PR |
|---|---|---|---|---|---|
| CU44 | Valorar actividad | `valoracion`, `retroalimentacion` | `No iniciado` | | |
| CU45 | Ver valoraciones | `valoracion` | `No iniciado` | | |
| CU46 | Editar valoración | `valoracion` | `No iniciado` | | |
| CU47 | Eliminar valoración | `valoracion` | `No iniciado` | | |

### Integración externa

| CU | Funcionalidad | Entidades | Estado | Rama | PR |
|---|---|---|---|---|---|
| CU48 | Obtener datos de lugares | `proveedor_externo`, `lugar` | `No iniciado` | | |
| CU49 | Sincronizar información externa | `sincronizacion_externa`, `proveedor_externo` | `No iniciado` | | |
| CU50 | Actualizar datos de actividades | `actividad`, `actividad_lugar`, `lugar` | `No iniciado` | | |
| CU51 | Registrar datos externos utilizados | `sincronizacion_externa`, `proveedor_externo` | `No iniciado` | | |
| CU52 | Obtener valoraciones externas | `sincronizacion_externa`, `proveedor_externo` | `No iniciado` | | |

### Administración

| CU | Funcionalidad | Entidades | Estado | Rama | PR |
|---|---|---|---|---|---|
| CU53 | Gestionar actividades | `actividad`, `actividad_lugar`, `actividad_categoria` | `No iniciado` | | |
| CU54 | Gestionar categorías | `categoria`, `estado_categoria` | `No iniciado` | | |
| CU55 | Moderar valoraciones | `valoracion` | `No iniciado` | | |
| CU56 | Eliminar contenido | — | `No iniciado` | | |
| CU57 | Administrar usuarios | `usuario`, `rol`, `estado_usuario` | `No iniciado` | | |
| CU58 | Visualizar métricas del sistema | — | `No iniciado` | | |
| CU59 | Revisar sugerencia de usuario | — | `No iniciado` | | |
| CU60 | Gestionar planes | `plan`, `estado_plan`, `detalle_plan` | `No iniciado` | | |
| CU61 | Gestionar permisos | `permiso`, `rol_permiso` | `No iniciado` | | |
| CU62 | Gestionar roles | `rol` | `No iniciado` | | |

### Transversales sin CU asignado

| Función | Entidades | Estado | Rama | PR |
|---|---|---|---|---|
| Validar acceso al sistema | `usuario`, `rol`, `permiso`, `sesion_usuario` | `No iniciado` | | |
| Registrar operaciones críticas (auditoría) | `registro_auditoria` | `No iniciado` | | |
| Notificar eventos del sistema | `notificacion`, `usuario` | `No iniciado` | | |
| Configurar parámetros del sistema | `parametro_sistema` | `No iniciado` | | |

---

## Decisiones

Decisiones técnicas tomadas y su motivo. Sirve para no rediscutir lo mismo dos veces.

| Fecha | Decisión | Motivo |
|---|---|---|
| — | PostgreSQL con TypeORM | Ya está fijado en las dependencias (`@nestjs/typeorm`, `typeorm`, `pg`). El documento entregable solo dice "base de datos relacional" |
| — | Autenticación JWT gestionada por el backend | Definido en el análisis de factibilidad técnica (Etapa 3) |
| 2026-08-06 | Nombres del dominio en español | Coinciden con la matriz de trazabilidad del documento entregable; traducirlos rompería la trazabilidad CU → código |
| 2026-08-11 | Validar el entorno con `class-validator` y no con Joi | Joi es la otra opción que documenta `@nestjs/config`, pero la convención de DTOs ya obliga a `class-validator`. Una sola librería de validación en el repo en lugar de dos |
| 2026-08-11 | La validación del entorno corre al arrancar, no al leer cada clave | Un `.env` incompleto rompe el arranque con el detalle de qué falta, en vez de aparecer como `undefined` a mitad de un request |
| 2026-08-11 | `JWT_SECRET` con mínimo de 32 caracteres | Largo mínimo recomendado para HS256. Es una restricción que el ticket no pedía; si molesta en desarrollo, se afloja en `VariablesEntorno` |
| 2026-08-11 | `allowBuilds` de pnpm versionado en `pnpm-workspace.yaml` | pnpm 10+ bloquea los scripts de instalación y aborta cualquier `pnpm <script>` con `ERR_PNPM_IGNORED_BUILDS`. Dejar la decisión en el repo la hace igual en todas las máquinas y en CI |
| 2026-08-11 | F02 (#24) se mergea antes que F01 (#23), y F01 se rebasa encima | Las dos ramas registran `ConfigModule` y se solapan en 7 archivos. F01 depende de F02, así que se respeta ese orden: al rebasar, F01 saca su propio `ConfigModule.forRoot()` y suma las `DB_*` al esquema de `VariablesEntorno` |
| 2026-08-11 | El seguimiento pasa de Jira a GitHub Issues | Decisión del equipo. El prefijo `SMART-` de las ramas se mantiene, pero el identificador ahora es el del ticket del sprint (`SMART-f02-...`) y no el de Jira. El PR cierra el issue con `Closes #NN` |
| 2026-08-18 | `no-explicit-any` en `error`, igual que `SmartPlan-front` | Unificar el criterio entre los dos repos antes de que haya código real que dependa de `any`. No hay usos de `any` en `src/`, así que el cambio no rompe `pnpm lint` |

---

## Pendientes conocidos

Cosas detectadas que todavía no tienen dueño:

- El `ValidationPipe` global todavía no está configurado. `class-validator` y
  `class-transformer` ya están en las dependencias (entraron con la validación del
  entorno), así que solo falta registrarlo en `main.ts` con `whitelist: true`.
- El motor de base de datos está decidido en el código (PostgreSQL) pero no en el
  documento entregable, que solo dice "base de datos relacional".
- El núcleo de `skills/` (`00-proyecto`, `01-dominio`, `02-git-flow`) está
  duplicado en `SmartPlan-front`. Al modificarlo, replicar en el otro repositorio.
- **Pendiente de replicar en `SmartPlan-front`:** el cambio de Jira a GitHub
  Issues en `skills/00-proyecto/SKILL.md` y `skills/02-git-flow/SKILL.md`
  (2026-08-11). Mientras no se replique, el front documenta una convención de
  ramas que ya no se usa.

---

## Bitácora

| Fecha | Qué pasó |
|---|---|
| 2026-08-06 | Creación de `skills/` y de este archivo de seguimiento. |
| 2026-08-11 | `ConfigModule` global con validación de esquema, `.env.example` y documentación de las variables de entorno. Desbloquea la conexión a PostgreSQL y las integraciones externas. |
| 2026-08-11 | Las skills pasan a documentar GitHub Issues en lugar de Jira, con el identificador del sprint en el nombre de rama (`SMART-f02-...`). Falta replicar en el front. |
| 2026-08-18 | Se separa `lint` de `lint:fix` (el script `lint` ya no incluye `--fix`) y se unifica `no-explicit-any` con el criterio del front (`error`). `pnpm lint` en verde. |
