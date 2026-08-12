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
| **Fase** | Fundaciones — configuración, conexión a base de datos y entidades del modelo listas; sin módulos de negocio |
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
| Conexión a PostgreSQL (TypeORM) | `En revisión` | `23-f01-conectar-typeorm-a-postgresql` | #23 | F01. `forRootAsync` + `docker-compose.yml` + migraciones. Integrado sobre F02 |
| Variables de entorno + `.env.example` | `Finalizado` | `SMART-f02-configuracion-por-variables-de-entorno` | #24 | `ConfigModule` global con validación de esquema al arranque (`src/config/variables-entorno.ts`). F01 le sumó las `DB_*` |
| Entidades de TypeORM del modelo de datos | `En progreso` | `SMART-f07-entidades-de-typeorm-del-modelo-de-datos` | #29 | F07. Las 37 entidades del modelo con relaciones e índices. Desbloquea todas las APIs |
| `ValidationPipe` global + `class-validator` | `No iniciado` | — | — | `class-validator` ya entró como dependencia con la validación del entorno |
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
| 2026-08-11 | Validar el entorno con `class-validator` y no con Joi | Joi es la otra opción que documenta `@nestjs/config`, pero la convención de DTOs ya obliga a `class-validator`. Una sola librería de validación en el repo en lugar de dos |
| 2026-08-11 | La validación del entorno corre al arrancar, no al leer cada clave | Un `.env` incompleto rompe el arranque con el detalle de qué falta, en vez de aparecer como `undefined` a mitad de un request |
| 2026-08-11 | `JWT_SECRET` con mínimo de 32 caracteres | Largo mínimo recomendado para HS256. Es una restricción que el ticket no pedía; si molesta en desarrollo, se afloja en `VariablesEntorno` |
| 2026-08-11 | `allowBuilds` de pnpm versionado en `pnpm-workspace.yaml` | pnpm 10+ bloquea los scripts de instalación y aborta cualquier `pnpm <script>` con `ERR_PNPM_IGNORED_BUILDS`. Dejar la decisión en el repo la hace igual en todas las máquinas y en CI |
| 2026-08-11 | F02 (#24) se mergea antes que F01 (#23), y F01 se rebasa encima | Las dos ramas registran `ConfigModule` y se solapan en 7 archivos. F01 depende de F02, así que se respeta ese orden: al rebasar, F01 saca su propio `ConfigModule.forRoot()` y suma las `DB_*` al esquema de `VariablesEntorno` |
| 2026-08-11 | `validarEntorno` descarta las claves con valor vacío antes de validar | `.env.example` lista todas las claves sin valor, así que un `cp .env.example .env` dejaba `NODE_ENV=` y `PORT=` en string vacío. `@IsOptional()` solo ignora `undefined` y `null`, no `''`, así que la app no arrancaba con la plantilla recién copiada |
| 2026-08-11 | `DB_SSL` se convierte con un `@Transform` que lee el valor crudo de `obj` | La conversión implícita de class-transformer resuelve `Boolean('false')`, que es `true`: sin esto, `DB_SSL=false` activaba el SSL y la conexión a la base local fallaba con "The server does not support SSL connections". El `@Transform` tiene que leer de `obj` porque `value` ya llega convertido |
| 2026-08-11 | F01 sumó `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` y `DB_SSL` al esquema, y `DATABASE_URL` pasó a opcional | Cumple lo acordado en la fila de abajo. Las `DB_*` son las mismas que consume `docker-compose.yml`, así que un solo `.env` configura el contenedor y la app. La condición cruzada (tiene que estar una de las dos formas) se chequea en `validarEntorno`, porque class-validator valida propiedad por propiedad |
| 2026-08-11 | El `DataSource` del CLI de migraciones reusa el factory y el validador de la aplicación | Evita que las migraciones y la app apunten a bases distintas por tener dos configuraciones separadas |
| 2026-08-11 | En producción las migraciones corren al arrancar (`migrationsRun: true`) | El despliegue en Railway es continuo desde GitHub y no hay un paso de deploy separado donde aplicarlas |
| 2026-08-11 | PostgreSQL local con `docker-compose.yml`, puerto tomado de `DB_PORT` | Varios del equipo ya tienen un PostgreSQL en 5432 de otros proyectos; así el puerto se cambia en el `.env` sin tocar el compose ni ensuciar el diff |
| 2026-08-11 | `test/entorno-de-prueba.ts` carga el `.env` real antes de los valores ficticios | Desde F01 el `AppModule` abre la conexión, así que los e2e necesitan la configuración real de la base. Las claves que no son de base de datos siguen siendo ficticias |
| 2026-08-11 | El modelo se implementa contra el **diagrama de clases** (Anexo Nº5) y no contra la lista de entidades de la matriz de trazabilidad | El diagrama tiene 39 clases con sus atributos; la matriz nombra 30 sin atributos. Donde no coinciden, manda el diagrama. Las que la matriz no nombra son `pais`, `ciudad`, `departamento`, `tipo_salida`, `estado_solicitud`, `solicitud_plan_categoria` y `recuperacion_contrasena` |
| 2026-08-11 | `reporte` y `tipo_reporte` quedan fuera del alcance: 37 tablas y no las 39 del diagrama | Decisión del equipo. REP-01 y REP-02 se arman consultando el resto del modelo; guardar el reporte como fila solo tendría sentido para reportes guardados por el usuario, que no están en ningún CU |
| 2026-08-11 | Clave primaria entera autoincremental (`id: number`), no UUID | Es lo que muestra el diagrama en todas las clases. Si más adelante se prefiere UUID por no exponer volumen de datos en las URLs, es un cambio de `EntidadBase` + una migración, no de cada entidad |
| 2026-08-11 | `created_at`, `updated_at` y `deleted_at` en inglés, en `EntidadBase` | Son las cuatro columnas que el diagrama repite en cada clase, y las maneja el ORM. El vocabulario del dominio sigue en español: lo que se traza contra los CU son las tablas y las columnas de negocio |
| 2026-08-11 | La baja es lógica en todas las entidades (`@DeleteDateColumn`) | El diagrama pone `deleted_at` en todas las clases. Eliminar una cuenta (CU7) o una actividad (CU53) sin dejar huérfanos los planes que las referencian solo se resuelve así |
| 2026-08-11 | Los catálogos (`estado_*`, `tipo_salida`, `rol`, `permiso`, `proveedor_externo`) heredan de `EntidadCatalogo` | Repiten los mismos tres atributos (`nombre`, `key`, `descripcion`). El código compara por `key`, que es estable, y no por `nombre`, que la administración puede editar |
| 2026-08-11 | Toda clave foránea lleva índice, o es la primera columna de un índice compuesto | PostgreSQL no indexa las claves foráneas solo: sin índice, navegar la relación recorre la tabla entera. Lo verifica `src/database/entidades.spec.ts` |
| 2026-08-11 | `actividad_lugar.latitud` y `.longitud` son `numeric(9,6)` y no texto, como los tipa el diagrama | La búsqueda en mapa (CU16) filtra por un rectángulo de coordenadas, y una comparación de rango sobre texto ordena alfabéticamente: `'9'` quedaría después de `'-68'` |
| 2026-08-11 | `solicitud_plan` lleva `id_usuario` en lugar del `id_solicitud_plan` que muestra el diagrama | Tal como está sería una clave foránea a sí misma con el nombre de su propia clave primaria. El propio diagrama documenta que la solicitud "se relaciona con usuario", y sin dueño no se puede armar el historial (PAN 13) ni ajustar recomendaciones (CU21) |
| 2026-08-11 | `usuario.id_preferencia` no se implementa | No hay tabla `preferencia` a la que apuntar: las preferencias son la relación N:M `preferencia_usuario`, que ya tiene su `id_usuario`. Sería una clave foránea sin destino |
| 2026-08-11 | `retroalimentacion` guarda `costo_real` y `duracion_real` además del texto | Son los atributos que muestra el diagrama, y son los que le dan valor a CU21: la diferencia entre lo que la solicitud pidió, lo que el plan estimó y lo que la salida terminó costando y durando es lo que corrige las próximas recomendaciones |
| 2026-08-11 | La tabla es `recuperacion_contrasena`, sin eñe | Un identificador con carácter no ASCII hay que comillarlo en cada consulta y se rompe distinto según el cliente. El repositorio ya escribe `contrasena` en el código |
| 2026-08-11 | El seguimiento pasa de Jira a GitHub Issues | Decisión del equipo. El prefijo `SMART-` de las ramas se mantiene, pero el identificador ahora es el del ticket del sprint (`SMART-f02-...`) y no el de Jira. El PR cierra el issue con `Closes #NN` |

---

## Pendientes conocidos

Cosas detectadas que todavía no tienen dueño:

- El script `lint` incluye `--fix`, lo que lo hace inservible como verificación en
  CI. Conviene separarlo en `lint` y `lint:fix`.
- `no-explicit-any` está `off` acá y en `error` en el front. Hay que unificar el
  criterio.
- El `ValidationPipe` global todavía no está configurado. `class-validator` y
  `class-transformer` ya están en las dependencias (entraron con la validación del
  entorno), así que solo falta registrarlo en `main.ts` con `whitelist: true`.
- El motor de base de datos está decidido en el código (PostgreSQL) pero no en el
  documento entregable, que solo dice "base de datos relacional".
- **`ConfigModule` está con `cache: true`, así que `ConfigService.get()` devuelve
  el valor crudo de `process.env` (string) y no el que dejó tipado
  `validarEntorno`.** `database.config.ts` lo compensa a mano para `DB_SSL` y
  `DB_PORT`. Conviene decidir de una: o se saca el `cache`, o se documenta que
  `ConfigService` no devuelve valores tipados y todo consumidor tiene que
  convertir.
- Desde F01, `pnpm test:e2e` levanta el `AppModule` completo, así que **necesita
  la base corrida** (`pnpm db:up`). Si molesta en CI, la salida es un módulo de
  test con `sqlite` en memoria o un servicio de PostgreSQL en el workflow.
- El entorno `test` usa `synchronize: true` contra la misma base que desarrollo.
  Cuando haya entidades reales conviene separarla (`DB_NAME=smartplan_test`).
- **La migración inicial no está generada.** F07 dejó las entidades, pero
  `pnpm migration:generate` necesita la base levantada y el esquema se estaba
  creando con `synchronize` en desarrollo. Antes del primer despliegue hay que
  correr `pnpm db:up && pnpm migration:generate src/database/migrations/EsquemaInicial`
  contra una base vacía: en producción `synchronize` está apagado y el esquema
  se mueve solo con migraciones.
- **La columna "Entidades" de los CU de acá abajo sale de la matriz de
  trazabilidad, y en algunos casos no coincide con el diagrama de clases.** Los
  tres desvíos que importan: `valoracion` cuelga de `plan` y no de `actividad`
  (CU44–CU47), `plan` no tiene `id_usuario` (el dueño sale de `solicitud_plan`)
  y las coordenadas están en `actividad_lugar`, no en `lugar`. Al tomar esos CU,
  mirar el código antes que la columna.
- La única clase del Anexo Nº5 que sigue sin nombre legible es el catálogo que
  referencia `solicitud_plan.id_tipo_salida`. Está implementada como
  `tipo_salida`; si en el diagrama original se llama distinto, es un renombre de
  tabla. `retroalimentacion` y `estado_plan` ya se completaron contra el
  diagrama.
- `retroalimentacion` no muestra `id_estado_retroalimentacion` entre sus
  atributos, pero el diagrama sí dibuja la relación con
  `estado_retroalimentacion`. La columna está porque sin ella la relación no se
  puede implementar.
- **CU58 (visualizar métricas del sistema) no tiene tablas propias.** `reporte` y
  `tipo_reporte` quedaron fuera del alcance, así que REP-01 y REP-02 se resuelven
  con consultas sobre el resto del modelo. Si más adelante hace falta guardar
  reportes armados por el usuario, vuelven a entrar.
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
| 2026-08-11 | F01: conexión a PostgreSQL con `TypeOrmModule.forRootAsync`, `docker-compose.yml` para la base local, scripts de migraciones y README del proyecto (reemplaza el boilerplate de NestJS). Conexión verificada contra el contenedor. |
| 2026-08-11 | Las skills pasan a documentar GitHub Issues en lugar de Jira, con el identificador del sprint en el nombre de rama (`SMART-f02-...`). Falta replicar en el front. |
| 2026-08-11 | F07: las 37 entidades del modelo con sus relaciones, índices y baja lógica, más `EntidadBase`, `EntidadCatalogo` y el transformador de decimales. `skills/01-dominio/` pasa a listar las 37 (antes 30, tomadas de la matriz), sin `reporte` ni `tipo_reporte`. Falta replicar la lista en el front y generar la migración inicial. |
