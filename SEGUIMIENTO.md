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
| **Última actualización** | 2026-08-15 |
| **Casos de uso finalizados** | 0 / 62 |

---

## Infraestructura y configuración

| Tarea | Estado | Rama | PR | Notas |
|---|---|---|---|---|
| Repositorio inicial (starter NestJS) | `Finalizado` | — | — | NestJS 11, TypeORM, driver `pg` |
| Protección de ramas `main` y `develop` | `Finalizado` | — | — | PR obligatorio + 2 aprobaciones |
| Skills y convenciones para agentes de IA | `En progreso` | `docs/skills-agentes-ia` | — | Este archivo y la carpeta `skills/` |
| Conexión a PostgreSQL (TypeORM) | `Finalizado` | `23-f01-conectar-typeorm-a-postgresql` | #37 | F01. `forRootAsync` + `docker-compose.yml` + migraciones. Integrado sobre F02 |
| Variables de entorno + `.env.example` | `Finalizado` | `SMART-f02-configuracion-por-variables-de-entorno` | #38 | `ConfigModule` global con validación de esquema al arranque (`src/config/variables-entorno.ts`). F01 le sumó las `DB_*` |
| Entidades de TypeORM del modelo de datos | `En revisión` | `SMART-f07-entidades-de-typeorm-del-modelo-de-datos` | #43 | F07. Las 37 entidades del modelo con relaciones, índices y restricciones. Desbloquea todas las APIs |
| Testing: configuración, moldes y base aislada | `En revisión` | `SMART-f13-testing-del-backend-configuracion-y-ejemplos` | #39 | F13. Base `smartplan_test` creada y vaciada sola, tres moldes de test y `skills/06-testing/` |
| `ValidationPipe` global + `class-validator` | `En revisión` | `SMART-f03-validacion-global-de-entrada` | #41 | Pipe global con `whitelist`, transformación y contrato uniforme de error; incluye DTO y pruebas. #41 ahora trae también F04 y el merge de `develop` |
| Prefijo `/api`, CORS y puerto del backend | `En revisión` | `SMART-f04-prefijo-api-cors-y-puerto-backend` | #44 | F04. **Integrado en F03** (#44 mergeado a la rama de #41): se aprueba y se cierra junto con #41 contra `develop` |
| Convención de la API: rutas, errores y paginación | `En revisión` | `SMART-f22-convencion-api-rutas-errores-paginacion` | #46 | F22. Filtro global de errores, contratos compartidos de paginación y orden, nombres de rutas y matriz de códigos HTTP |
| Módulo de autenticación JWT | `No iniciado` | — | — | Cubre CU1–CU4 |
| Migraciones de TypeORM | `En revisión` | `SMART-f08-migracion-inicial-y-configuracion-del-cli-de-typeorm` | #45 | F01 dejó el `DataSource` y los scripts, F07 agrega `EsquemaInicial`; F08 documenta y verifica el flujo completo |
| Separar `lint` de `lint:fix` | `No iniciado` | — | — | El script `lint` actual trae `--fix`; ver `skills/04-calidad/` |
| Unificar criterio de `no-explicit-any` con el front | `No iniciado` | — | — | Acá está `off`, en el front está en `error` |
| Spike: integración con Google Maps Platform | `En revisión` | `SMART-f11-spike-integracion-con-google-maps-platform` | — | F11 (#33). Places API (New) + Routes API (Compute Route Matrix) + Geocoding API; **sin Distance Matrix (Legacy)**, ver Decisiones. Corrida real exitosa: BUTE y Rama Negra Hogar de Café resueltos con `placeId`/coordenadas/dirección reales, distancia 638 m / 141 s entre ambos, geocoding de "Mendoza, Argentina" correcto. Costo estimado de la corrida y SKUs cruzados contra los parámetros de request en Decisiones y bitácora 2026-08-17. Falta ejecutar `pnpm test:e2e` (no aplica: el spike no toca `AppModule` ni entidades) y abrir el PR |

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
| 2026-08-15 | El diagrama amplía la estructura, pero la matriz de trazabilidad manda sobre el comportamiento funcional | El diagrama aporta clases y atributos que la matriz no enumera; cuando contradice un CU o una pantalla, se preserva la trazabilidad. Por eso `valoracion` referencia `actividad` (CU44, PAN 18) |
| 2026-08-11 | `reporte` y `tipo_reporte` quedan fuera del alcance: 37 tablas y no las 39 del diagrama | Decisión del equipo. REP-01 y REP-02 se arman consultando el resto del modelo; guardar el reporte como fila solo tendría sentido para reportes guardados por el usuario, que no están en ningún CU |
| 2026-08-11 | Clave primaria entera autoincremental (`id: number`), no UUID | Es lo que muestra el diagrama en todas las clases. Si más adelante se prefiere UUID por no exponer volumen de datos en las URLs, es un cambio de `EntidadBase` + una migración, no de cada entidad |
| 2026-08-11 | `created_at`, `updated_at` y `deleted_at` en inglés, en `EntidadBase` | Son las cuatro columnas que el diagrama repite en cada clase, y las maneja el ORM. El vocabulario del dominio sigue en español: lo que se traza contra los CU son las tablas y las columnas de negocio |
| 2026-08-11 | La baja es lógica en todas las entidades (`@DeleteDateColumn`) | El diagrama pone `deleted_at` en todas las clases. Eliminar una cuenta (CU7) o una actividad (CU53) sin dejar huérfanos los planes que las referencian solo se resuelve así |
| 2026-08-11 | Los catálogos (`estado_*`, `tipo_salida`, `rol`, `permiso`, `proveedor_externo`) heredan de `EntidadCatalogo` | Repiten los mismos tres atributos (`nombre`, `key`, `descripcion`). El código compara por `key`, que es estable, y no por `nombre`, que la administración puede editar |
| 2026-08-11 | Toda clave foránea lleva índice, o es la primera columna de un índice compuesto | PostgreSQL no indexa las claves foráneas solo: sin índice, navegar la relación recorre la tabla entera. Lo verifica `src/database/entidades.spec.ts` |
| 2026-08-11 | `actividad_lugar.latitud` y `.longitud` son `numeric(9,6)` | El diagrama las tipa como número sin fijar precisión. `numeric` compara exacto, que es lo que necesita el filtro por rectángulo de coordenadas de CU16, y seis decimales dan ~11 cm de error |
| 2026-08-11 | `solicitud_plan` lleva `id_usuario` en lugar del `id_solicitud_plan` que muestra el diagrama | Tal como está sería una clave foránea a sí misma con el nombre de su propia clave primaria. El propio diagrama documenta que la solicitud "se relaciona con usuario", y sin dueño no se puede armar el historial (PAN 13) ni ajustar recomendaciones (CU21) |
| 2026-08-15 | Todo `plan` tiene `id_usuario`; `id_solicitud_plan` sigue opcional | Los planes manuales de CU24 no nacen de una solicitud, pero igual necesitan propietario para listarlos y autorizar edición o eliminación |
| 2026-08-15 | `solicitud_plan` guarda `id_departamento` y `duracion_disponible` | Ubicación y tiempo disponible son entradas del objetivo general y de CU17; no pueden depender de interpretar `observaciones` |
| 2026-08-15 | Los índices únicos reutilizables son parciales sobre filas activas | La baja lógica conserva las claves. Sin `WHERE deleted_at IS NULL`, quitar y volver a agregar un favorito, preferencia o relación fallaría por unicidad |
| 2026-08-15 | PostgreSQL aplica restricciones `CHECK` a los valores críticos | Los DTO validarán la entrada HTTP, pero la base también protege puntajes, importes, duraciones, órdenes, cantidades y coordenadas ante cualquier escritor |
| 2026-08-11 | `usuario.id_preferencia` no se implementa | No hay tabla `preferencia` a la que apuntar: las preferencias son la relación N:M `preferencia_usuario`, que ya tiene su `id_usuario`. Sería una clave foránea sin destino |
| 2026-08-11 | `retroalimentacion` guarda `costo_real` y `duracion_real` además del texto | Son los atributos que muestra el diagrama, y son los que le dan valor a CU21: la diferencia entre lo que la solicitud pidió, lo que el plan estimó y lo que la salida terminó costando y durando es lo que corrige las próximas recomendaciones |
| 2026-08-11 | La tabla es `recuperacion_contrasena`, sin eñe | Un identificador con carácter no ASCII hay que comillarlo en cada consulta y se rompe distinto según el cliente. El repositorio ya escribe `contrasena` en el código |
| 2026-08-11 | Los e2e corren contra una base aparte (`smartplan_test`) en el mismo servidor, no contra una base en memoria | `synchronize: true` reescribe el esquema, así que compartir base con desarrollo era perder datos. Se descartó SQLite en memoria porque dejaría de probar PostgreSQL justo donde más importa (tipos, migraciones, SQL propio) |
| 2026-08-11 | La base de prueba se crea sola y solo se vacía al empezar la corrida, no al terminar | Recrearla en cada corrida es lento, y dejarla en pie permite abrirla con un cliente SQL para entender un test que falló. El aislamiento lo garantiza vaciarla al empezar |
| 2026-08-11 | Los tests se niegan a arrancar si el nombre de la base no termina en `_test` | Es la única defensa real contra correr `DROP SCHEMA` sobre la base de desarrollo o, peor, la de producción. Preferimos un test que no corre a un test que borra datos |
| 2026-08-11 | Los e2e corren de a uno (`maxWorkers: 1`) | Comparten una única base de prueba: en paralelo, una suite trunca las tablas que otra está usando |
| 2026-08-12 | Las integraciones de agentes no usan enlaces simbólicos versionados | Los symlinks se degradan a archivos de texto en clones Windows sin permisos especiales. Claude y OpenCode usan adaptadores con nombres válidos que remiten a la fuente única `skills/`; Codex consume `AGENTS.md` en la raíz |
| 2026-08-11 | El molde con dependencias mockeadas vive en `skills/06-testing/`, no en un `.spec.ts` | Todavía no hay entidades ni repositorios que mockear. Inventar un servicio de mentira solo para tener el ejemplo agregaría código muerto al repo |
| 2026-08-11 | El seguimiento pasa de Jira a GitHub Issues | Decisión del equipo. El prefijo `SMART-` de las ramas se mantiene, pero el identificador ahora es el del ticket del sprint (`SMART-f02-...`) y no el de Jira. El PR cierra el issue con `Closes #NN` |
| 2026-08-13 | F08 se reduce a documentar y verificar el flujo: el datasource, los scripts y la migración inicial ya los habían entregado F01 y F07 | Los tres primeros puntos del ticket estaban hechos antes de empezarlo — F01 dejó `data-source.ts` y los scripts, y la migración `EsquemaInicial` se escribió dentro de la rama de F07. Reescribirlos habría sido duplicar trabajo mergeado. Queda como entregable el cuarto punto (documentar el flujo) más la verificación end-to-end |
| 2026-08-13 | La rama de F08 sale de la de F07 y no de `develop` | Sin las 37 entidades no hay nada contra qué correr ni verificar las migraciones. F07 se revisa en el PR #43 y cierra el issue #29; cuando se integre, el diff de F08 contra `develop` quedará reducido a su documentación |
| 2026-08-13 | El CLI de TypeORM ignora el `synchronize: true` que trae el factory compartido | Verificado: `migration:run` sobre una base vacía crea las 37 tablas y registra la migración, sin sincronizar antes. El CLI pisa `synchronize`, `migrationsRun` y `dropSchema` en `false` al inicializar el `DataSource`, así que compartir el factory con la app no obliga a un datasource aparte |
| 2026-08-15 | Los listados usan página desde 1, límite 20 (máximo 100), orden permitido por módulo y respuesta `{ datos, paginacion }` | Un contrato y helpers comunes evitan que cada módulo defina parámetros y metadatos incompatibles; el desempate por `id` mantiene páginas estables |
| 2026-08-15 | Todos los fallos HTTP usan `{ statusCode, codigo, mensaje, ruta, timestamp }` | El filtro global conserva códigos propios del dominio, agrega el detalle estructurado de validación y oculta mensajes y stacks de excepciones internas |
| 2026-08-17 | El spike F11 usa Places API (New) + Routes API (Compute Route Matrix) + Geocoding API, **no** Distance Matrix API | `developers.google.com/maps/documentation/distance-matrix/overview` (Last updated 2026-08-11 UTC) marca Distance Matrix como Legacy: *"This API is now in legacy mode. Use Compute Route Matrix instead."* No se encontró ninguna razón técnica documentada para preferir la legacy hoy. La elección de las tres APIs salió de las necesidades reales de SmartPlan (buscar un lugar por nombre, resolver una ubicación en texto libre, calcular distancia/duración entre dos lugares), no del texto original del ticket #33 |
| 2026-08-17 | Geocoding API se incluye en el spike aunque Places Text Search ya resuelve lugares con nombre propio | `SmartPlan.md` (~línea 7290 y ~4869) documenta la pantalla de preferencias con "Ubicación preferida" en texto libre (ej. "Buenos Aires, CABA") y "usar ubicación del dispositivo", con la expectativa de que el mapa se centre ahí. Es geocodificar una zona/ciudad, no buscar un negocio — un caso que Places Text Search no cubre igual de bien. Geocoding sigue vigente y sin reemplazo documentado |
| 2026-08-17 | El SKU facturado no se lee de la respuesta HTTP de Google: se determina cruzando los parámetros exactos de la request contra las tablas oficiales de billing | Ni Places API (New) ni Routes API devuelven un campo o header tipo "billed-sku" en la respuesta. Para Text Search, el Field Mask enviado (`places.id,places.displayName,places.formattedAddress,places.location`) determina el tier según `developers.google.com/maps/documentation/places/web-service/data-fields`: como incluye `formattedAddress`/`location` (no forman parte del set Essentials "IDs Only": `places.attributions`, `places.id`, `places.name`, `nextPageToken`, `places.movedPlace`, `places.movedPlaceId`), la llamada real corresponde al SKU **Text Search Pro**. Para Compute Route Matrix, el `routingPreference` enviado (`TRAFFIC_UNAWARE`, sin `TRAFFIC_AWARE`/`TRAFFIC_AWARE_OPTIMAL`) corresponde al SKU **Essentials**, según `developers.google.com/maps/documentation/routes/usage-and-billing` (la Pro se factura por usar un route modifier avanzado, que esta corrida no usó). Geocoding tiene un único tier (Essentials), no requiere este cruce |
| 2026-08-17 | Costo estimado de la corrida real del spike F11, con los SKUs determinados arriba | 1 Text Search Pro (US\$32,00/1000 en el primer escalón) + 1 Compute Route Matrix Essentials, facturado por elemento — 1 elemento (US\$5,00/1000) + 1 Geocoding (US\$5,00/1000). Costo de esta corrida puntual: US\$0,032 + US\$0,005 + US\$0,005 = **US\$0,042**. Las tres llamadas cayeron dentro del free usage cap mensual por SKU (Pro: 5.000/mes gratis; Essentials: 10.000/mes gratis), así que el costo real de esta corrida fue US\$0 — el cálculo de pay-as-you-go es para dimensionar el caso donde el free tier ya esté agotado. Fuente de precios: `developers.google.com/maps/billing-and-pricing/pricing` y `developers.google.com/maps/documentation/routes/usage-and-billing`, consultadas 2026-08-16/17 |
| 2026-08-17 | El free tier de US\$200/mes de Google Maps Platform ya no existe; fue reemplazado por un cap de uso gratis mensual por SKU individual, vigente desde el 1 de marzo de 2025 | `developers.google.com/maps/billing-and-pricing/faq`: *"we are modifying the USD $200 monthly recurring credit by offering a free monthly usage threshold for each Core Services SKU."* Caps confirmados: Essentials 10.000 llamadas/mes, Pro 5.000/mes, Enterprise 1.000/mes (`developers.google.com/maps/billing-and-pricing/pricing-categories`). El contador se resetea el día 1 de cada mes (medianoche hora Pacífico) |
| 2026-08-17 | Google Maps Platform exige un proyecto de Google Cloud con billing habilitado para usar cualquiera de las tres APIs, aunque el uso se mantenga dentro del free cap | Requisito estándar de Google Cloud para activar APIs pagas (documentado de forma consistente en la plataforma; la key real usada en esta corrida ya tenía billing habilitado desde antes de este ticket). El free cap reduce el costo a cero dentro del umbral mensual, pero no reemplaza el requisito de tener una cuenta de facturación activa asociada al proyecto |
| 2026-08-17 | Política de caching: `placeId` cacheable indefinidamente; latitud/longitud cacheable hasta 30 días consecutivos, después hay que borrar o volver a consultar | `cloud.google.com/maps-platform/terms/maps-service-terms`, sección 5.4 (Places): *"Customer can cache Places API Place ID (place_id) values, in accordance with the Places API Policies"* y *"Customer can temporarily cache latitude (lat) and longitude (lng) values from the [...] API for up to 30 consecutive calendar days, after which Customer must delete the cached latitude and longitude values."* Mismo texto para Geocoding (sección 3.4) y Routes (sección 11.4). `developers.google.com/maps/documentation/places/web-service/policies` confirma la regla general: *"You must not pre-fetch, cache, or store Places API content beyond the allowed exceptions"*, con `place_id` como la excepción explícita |
| 2026-08-17 | El resto de campos de Places (rating, cantidad de reseñas, horarios, nivel de precio) no tiene una excepción de caching confirmada en la investigación de este spike, así que se recomienda no persistirlos | La política general de Places prohíbe cachear salvo las excepciones documentadas (`place_id` indefinido, lat/lng 30 días); no se encontró una cláusula específica que habilite cachear rating/reviews/horarios/priceLevel. Los términos de Geocoding sí contemplan excepciones de almacenamiento indefinido bajo condiciones end-user-facing específicas, pero el spike no las verificó ni las usa — queda anotado para revisar si más adelante se necesita extender la persistencia más allá de lo conservador |
| 2026-08-17 | Esquema recomendado para `lugar` (F11, sin implementar): agregar `googlePlaceId` (varchar, único, nullable); no agregar coordenadas ni campos de Places más allá de placeId | `nombre` y `direccion` ya existen en `src/lugares/entities/lugar.entity.ts` y cubren lo que Places devuelve. Las coordenadas siguen en `actividad_lugar` (decisión de dominio ya documentada: el punto de encuentro depende de la actividad), reforzado por la política de 30 días de Google, que desaconseja tratarlas como dato permanente de `lugar`. No se propone persistir rating, reviews, horarios ni price level: no están pedidos por ningún CU vigente y van contra la política de caching sin excepción confirmada |

---

## Pendientes conocidos

Cosas detectadas que todavía no tienen dueño:

- El script `lint` incluye `--fix`, lo que lo hace inservible como verificación en
  CI. Conviene separarlo en `lint` y `lint:fix`.
- `no-explicit-any` está `off` acá y en `error` en el front. Hay que unificar el
  criterio.
- El motor de base de datos está decidido en el código (PostgreSQL) pero no en el
  documento entregable, que solo dice "base de datos relacional".
- **`ConfigModule` está con `cache: true`, así que `ConfigService.get()` devuelve
  el valor crudo de `process.env` (string) y no el que dejó tipado
  `validarEntorno`.** `database.config.ts` lo compensa a mano para `DB_SSL` y
  `DB_PORT`. Conviene decidir de una: o se saca el `cache`, o se documenta que
  `ConfigService` no devuelve valores tipados y todo consumidor tiene que
  convertir.
- Desde F01, `pnpm test:e2e` levanta el `AppModule` completo, así que **necesita
  la base corrida** (`pnpm db:up`). F13 la aisló en `smartplan_test` y la crea
  sola, pero el servidor de PostgreSQL sigue teniendo que estar.
- La migración inicial (`EsquemaInicial`) crea las 37 tablas de una sola vez. De
  acá en adelante, **cada cambio de entidad necesita su propia migración**
  (`pnpm migration:generate`): en desarrollo `synchronize` ajusta el esquema
  solo y es fácil olvidarse, pero en producción está apagado y lo único que
  mueve el esquema son las migraciones.
- La matriz de trazabilidad y el diagrama no coinciden en todos los atributos.
  La matriz manda sobre el comportamiento funcional: `valoracion` referencia
  `actividad`, todo `plan` conserva su dueño y las coordenadas permanecen en
  `actividad_lugar` porque representan el punto de encuentro.
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
- **No hay workflow de CI.** `.github/` solo tiene `copilot-instructions.md`, así
  que `pnpm lint`, `pnpm test` y `pnpm test:e2e` dependen de que cada uno se
  acuerde de correrlos antes del PR. Con la infraestructura de tests ya lista
  (F13), armar el workflow es lo que falta para que la Definition of Done se
  verifique sola: necesita un `services: postgres` y las variables del `.env`.
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
| 2026-08-11 | F07: las 37 entidades del modelo con sus relaciones, índices y baja lógica, más `EntidadBase`, `EntidadCatalogo` y el transformador de decimales. `skills/01-dominio/` pasa a listar las 37 (antes 30, tomadas de la matriz), sin `reporte` ni `tipo_reporte`. Falta replicar la lista en el front. |
| 2026-08-15 | F07: `EsquemaInicial` regenerada y verificada contra PostgreSQL 16: 37 tablas de dominio, 41 claves foráneas, 102 índices y 17 restricciones `CHECK`; `schema:log` sin diferencias, `migration:revert` y e2e contra base aislada. |
| 2026-08-15 | F08: flujo de migraciones documentado en el README (generar, revisar, aplicar, revertir y verificar) y comprobado contra PostgreSQL 16 sobre base vacía; después de `migration:revert`, `migration:show` marca `EsquemaInicial` como pendiente. |
| 2026-08-11 | F13: infraestructura de tests. Base `smartplan_test` aislada (se crea y se vacía sola), moldes de test unitario de servicio, de controller con mock y de endpoint e2e, revisión de las dos configuraciones de Jest y `skills/06-testing/`. Habilita la Definition of Done. |
| 2026-08-11 | F03: `ValidationPipe` global compartido por producción y e2e, con `whitelist`, transformación y respuestas de validación uniformes. Se agregó un DTO de referencia y pruebas unitarias/e2e. |
| 2026-08-12 | Documentación corregida y ampliada: se restauraron textos truncados, requisitos explícitos de Node.js/pnpm, seguridad de la base e2e e integración portable de OpenCode. |
| 2026-08-12 | F04: prefijo global `/api`, CORS restringido al origen configurable del frontend y puerto `3001` por defecto. La configuración HTTP queda compartida entre producción y e2e. |
| 2026-08-15 | F22: convención común de API con filtro global de errores, DTO y respuesta paginada reutilizables, orden seguro por campos permitidos, rutas en español/plural/kebab-case y matriz de códigos HTTP. PR #46. |
| 2026-08-17 | F11 (#33): código del spike de integración con Google Maps Platform (`src/integracion-externa/google-maps/`), sin registrar en ningún módulo de Nest. `GoogleMapsClienteService` con `buscarLugar` (Places Text Search New), `calcularDistancia` (Routes Compute Route Matrix por `placeId`) y `geocodificar` (Geocoding API), reutilizando `GOOGLE_MAPS_API_KEY` ya existente en el esquema de entorno. Unitario con camino feliz + un error representativo por método (`google-maps-cliente.service.spec.ts`), `fetch` mockeado. `pnpm lint`, `pnpm test` y `pnpm build` en verde. |
| 2026-08-17 | F11 (#33): corrida real exitosa de `google-maps-spike.spike.spec.ts` con `RUN_GOOGLE_MAPS_SPIKE=1` y `GOOGLE_MAPS_API_KEY` real. BUTE (`ChIJG7thoxsJfpYR5W1xEI9hsgw`, Gral. Espejo 501) y Rama Negra Hogar de Café (`ChIJ5X4eXQQJfpYRwrSw8uO6_jY`, Av. Belgrano 980) resueltos con dirección y coordenadas reales; distancia 638 m, duración 141 s entre ambos (Compute Route Matrix, `routingPreference: TRAFFIC_UNAWARE`); geocoding de "Mendoza, Argentina" devolvió coordenadas correctas de la ciudad. SKUs determinados y costo calculado en Decisiones. Falta: documentar en `docs/decisiones.md` y abrir el PR (`test:e2e` no aplica — el spike no toca `AppModule` ni entidades). |
