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
| **Fase** | Fundaciones — conexión a base de datos configurada, sin entidades ni módulos de negocio |
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
| Conexión a PostgreSQL (TypeORM) | `En revisión` | `23-f01-conectar-typeorm-a-postgresql` | #23 | F01. `forRootAsync` + `docker-compose.yml` + README |
| Variables de entorno + `.env.example` | `En progreso` | `23-f01-conectar-typeorm-a-postgresql` | #23 | F01 dejó `ConfigModule` global y las claves de BD. Faltan JWT y Google Maps (F02, #24) |
| `ValidationPipe` global + `class-validator` | `No iniciado` | — | — | `class-validator` todavía no está en dependencias |
| Módulo de autenticación JWT | `No iniciado` | — | — | Cubre CU1–CU4 |
| Migraciones de TypeORM | `En progreso` | `23-f01-conectar-typeorm-a-postgresql` | #23 | F01 dejó el `DataSource` y los scripts. No hay migraciones escritas: llegan con las primeras entidades |
| Separar `lint` de `lint:fix` | `No iniciado` | — | — | El script `lint` actual trae `--fix`; ver `skills/04-calidad/` |
| Unificar criterio de `no-explicit-any` con el front | `No iniciado` | — | — | Acá está `off`, en el front está en `error` |

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
| 2026-08-11 | La conexión acepta `DATABASE_URL` **o** variables sueltas (`DB_HOST`, `DB_PORT`, …), con prioridad para la URL | Railway entrega una URL; en desarrollo las variables sueltas son las mismas que consume `docker-compose.yml`, así que la app y el contenedor se configuran una sola vez |
| 2026-08-11 | El `DataSource` del CLI de migraciones reusa el factory de la aplicación | Evita que las migraciones y la app apunten a bases distintas por tener dos configuraciones separadas |
| 2026-08-11 | En producción las migraciones corren al arrancar (`migrationsRun: true`) | El despliegue en Railway es continuo desde GitHub y no hay un paso de deploy separado donde aplicarlas |
| 2026-08-11 | PostgreSQL local con `docker-compose.yml`, puerto tomado de `DB_PORT` | Varios del equipo ya tienen un PostgreSQL en 5432 de otros proyectos; así el puerto se cambia en el `.env` sin tocar el compose ni ensuciar el diff |

---

## Pendientes conocidos

Cosas detectadas que todavía no tienen dueño:

- El script `lint` incluye `--fix`, lo que lo hace inservible como verificación en
  CI. Conviene separarlo en `lint` y `lint:fix`.
- `no-explicit-any` está `off` acá y en `error` en el front. Hay que unificar el
  criterio.
- `class-validator` y `class-transformer` no están en las dependencias, pero la
  convención de DTOs los requiere.
- Desde F01, `pnpm test:e2e` levanta el `AppModule` completo, así que **necesita
  la base corrida** (`pnpm db:up`). Si molesta en CI, la salida es un módulo de
  test con `sqlite` en memoria o un servicio de PostgreSQL en el workflow.
- El entorno `test` usa `synchronize: true` contra la misma base que desarrollo.
  Cuando haya entidades reales conviene separarla (`DB_NAME=smartplan_test`).
- El motor de base de datos está decidido en el código (PostgreSQL) pero no en el
  documento entregable, que solo dice "base de datos relacional".
- El núcleo de `skills/` (`00-proyecto`, `01-dominio`, `02-git-flow`) está
  duplicado en `SmartPlan-front`. Al modificarlo, replicar en el otro repositorio.

---

## Bitácora

| Fecha | Qué pasó |
|---|---|
| 2026-08-06 | Creación de `skills/` y de este archivo de seguimiento. |
| 2026-08-11 | F01: conexión a PostgreSQL con `TypeOrmModule.forRootAsync`, `docker-compose.yml` para la base local, scripts de migraciones y README del proyecto (reemplaza el boilerplate de NestJS). Conexión verificada contra el contenedor. |
