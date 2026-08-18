---
name: smartplan-backend
description: Convenciones del backend NestJS — estructura de módulos, TypeORM, JWT, validación y manejo de errores. Leer antes de escribir cualquier controller, service o entidad.
---

# SmartPlan Back — Convenciones

Específico de `SmartPlan-back`.

## Stack

| Pieza | Versión | Nota |
|---|---|---|
| NestJS | 11.x | |
| TypeScript | 5.7.x | |
| TypeORM | 0.3.x | vía `@nestjs/typeorm` |
| PostgreSQL | — | driver `pg` |
| Jest | 30.x | unitarios (`*.spec.ts`) y e2e (`test/`) |
| ESLint | 9.x | con Prettier integrado |
| Prettier | 3.x | |

Gestor de paquetes: **pnpm**.

## Comandos

```bash
pnpm install       # instalar dependencias
pnpm start:dev     # servidor con watch
pnpm start:worker:dev  # worker con watch (F12, necesita RabbitMQ levantado)
pnpm build         # compilar
pnpm lint          # análisis estático (ojo: trae --fix, ver abajo)
pnpm format        # formatear con Prettier
pnpm test          # tests unitarios
pnpm test:e2e      # tests end-to-end
pnpm test:cov      # cobertura
```

## Estructura

Está en scaffold (`app.controller.ts`, `app.service.ts`, `app.module.ts`,
`main.ts`). Al crecer, la organización esperada de NestJS es **un módulo por
módulo del sistema**:

```
src/
├── main.ts                 bootstrap de la API (HTTP)
├── worker.ts                bootstrap del worker (F12) — proceso aparte, sin HTTP
├── app.module.ts
├── config/                 configuración y variables de entorno
├── database/               conexión a PostgreSQL, DataSource del CLI, migraciones
├── common/                 guards, interceptors, pipes, filters, decoradores
├── mensajeria/             F12 — colas de mensajes, publisher y worker
├── auth/                   CU1–CU4: login, registro, recuperación, logout
├── usuarios/               CU5–CU8, CU57, CU61, CU62
├── actividades/            CU9–CU11, CU14, CU53
├── lugares/                catálogo de lugares
├── categorias/             CU54
├── planes/                 CU12, CU13, CU24–CU31, CU60
├── recomendacion/          CU17–CU23
├── colecciones/            CU32–CU38
├── favoritos/              CU15, CU39–CU43
├── valoraciones/           CU44–CU47, CU55
├── integracion-externa/    CU48–CU52 (Google Maps)
└── administracion/         CU56, CU58, CU59
```

Cada módulo con la estructura estándar de NestJS:

```
planes/
├── planes.module.ts
├── planes.controller.ts
├── planes.service.ts
├── dto/
│   ├── crear-plan.dto.ts
│   └── actualizar-plan.dto.ts
└── entities/
    ├── plan.entity.ts
    └── detalle-plan.entity.ts
```

## Nombres

Los nombres del dominio van **en español** (ver `skills/01-dominio/`).

| Qué | Convención | Ejemplo |
|---|---|---|
| Tabla en PostgreSQL | `snake_case`, singular | `detalle_plan` |
| Clase de entidad | `PascalCase` | `DetallePlan` |
| Archivo | `kebab-case` + sufijo | `detalle-plan.entity.ts` |
| Ruta de API | `kebab-case`, plural | `/api/detalle-planes` |
| Columna | `snake_case` | `costo_estimado` |

El nombre de la tabla se declara explícitamente para que coincida con la matriz
de trazabilidad del documento:

```ts
@Entity('detalle_plan')
export class DetallePlan { ... }
```

No traduzcas las entidades al inglés. La trazabilidad CU → entidad → código es un
requisito del entregable.

## Entidades

Las 37 entidades del modelo están en `src/<módulo>/entities/`. El modelo lo fija
el diagrama de clases (Anexo Nº5); la lista completa está en
`skills/01-dominio/`.

Al escribir una entidad nueva o tocar una existente:

- **Extendé `EntidadBase`** (`src/common/entidades/entidad-base.ts`): trae `id`,
  `created_at`, `updated_at` y `deleted_at`. Nunca redeclares esas cuatro.
- **Si es una tabla de catálogo** (`estado_*`, `tipo_*`, `rol`, `permiso`),
  extendé `EntidadCatalogo`: agrega `nombre`, `key` único y `descripcion`. En el
  código se compara por `key`, nunca por `nombre` ni por `id`.
- **La baja es lógica.** `deleted_at` la maneja `@DeleteDateColumn`: usá
  `repositorio.softRemove()`, no `delete()`. Las consultas saltean las filas
  dadas de baja solas.
- **Un índice único sobre datos reutilizables excluye las bajas:** agregá
  `where: '"deleted_at" IS NULL'`. Sin esa condición, quitar y volver a agregar
  un favorito o una preferencia falla porque la fila eliminada conserva sus
  claves. Los hashes de sesión y recuperación no se reutilizan y quedan únicos
  sobre todo el historial.
- **Los invariantes críticos también viven en PostgreSQL con `@Check`.** Los
  DTO protegen la API; la restricción protege la base frente a migraciones,
  scripts y otros escritores. Puntajes, importes, duraciones, órdenes y
  coordenadas no pueden quedar fuera de rango.
- **Las claves foráneas se llaman `id_<entidad>`** y se declaran dos veces: la
  columna (`@Column({ name: 'id_usuario' })`) y la relación (`@ManyToOne` +
  `@JoinColumn`). Tener la columna suelta evita un `JOIN` cuando solo se
  necesita el id.
- **Toda clave foránea va indexada.** PostgreSQL no las indexa solo. Si la
  columna ya es la primera de un índice compuesto, alcanza con ese.
- **Los importes son `numeric` con `transformadorDecimal`**
  (`src/common/typeorm/transformador-decimal.ts`). Sin el transformador, el
  driver `pg` devuelve string y las sumas concatenan; con `float`, dos cuentas
  equivalentes dan distinto.
- **Definí `onDelete`** en cada relación: `CASCADE` cuando el hijo no tiene
  sentido sin el padre (un `detalle_plan` sin plan), `RESTRICT` contra los
  catálogos, `SET NULL` cuando la referencia es opcional.

`src/database/entidades.spec.ts` chequea todo esto sin necesidad de base: nombres
de tabla contra la lista del diagrama, columnas en `snake_case`, clave primaria,
baja lógica, índices únicos parciales, relaciones estructurales, restricciones de
dominio y que ninguna clave foránea quede sin índice.
Corrélo con `pnpm test` después de tocar una entidad.

## Reglas de la API

- Prefijo global `/api`.
- Verbos REST estándar: `GET` listar/consultar, `POST` crear, `PATCH` modificar,
  `DELETE` eliminar.
- Las rutas son sustantivos **en español, plurales y en `kebab-case`**:
  `/api/planes`, `/api/detalle-planes`. No uses verbos (`/crear-plan`), inglés
  (`/users`) ni singular (`/actividad`). Los recursos hijos conservan la misma
  regla: `/api/planes/:id/detalle-planes`.
- Los nombres que forman parte de una URL pública no siguen necesariamente el
  nombre de la tabla: la tabla queda en `snake_case` singular y la ruta en
  `kebab-case` plural.
- **DTOs con `class-validator` para toda entrada.** Nada de leer `req.body` crudo.
- `ValidationPipe` global con `whitelist: true` para descartar propiedades no
  declaradas en el DTO.
- Las entidades de TypeORM **no se devuelven directamente** si contienen datos
  sensibles (`usuario.contrasena`, tokens). Usá un DTO de respuesta o `@Exclude()`.

## Listados: paginación y orden

Todo `GET` que devuelve una colección recibe `ConsultaPaginadaDto`, de
`src/common/pagination/consulta-paginada.dto.ts`. La convención pública es:

| Query param | Tipo | Default | Regla |
|---|---|---|---|
| `pagina` | entero | `1` | Empieza en 1 |
| `limite` | entero | `20` | Entre 1 y 100 |
| `ordenarPor` | string | definido por el endpoint | Solo campos públicos permitidos por ese módulo |
| `direccion` | `asc` \| `desc` | `asc` | Minúsculas |

Ejemplo: `GET /api/actividades?pagina=2&limite=20&ordenarPor=nombre&direccion=asc`.

Cada módulo publica en su DTO cuáles son los valores permitidos de `ordenarPor`
y los traduce explícitamente a columnas. **Nunca interpoles el parámetro en SQL
ni lo pases a TypeORM sin una lista permitida.** Si no viene, el endpoint aplica
un orden predeterminado documentado. El orden siempre tiene un desempate estable
por `id`; sin él, un registro puede saltar de página cuando dos valores coinciden.

```ts
export enum CampoOrdenActividad {
  NOMBRE = 'nombre',
  PRECIO = 'precio',
}

export class ListarActividadesDto extends ConsultaPaginadaDto {
  @IsEnum(CampoOrdenActividad)
  @IsOptional()
  declare ordenarPor?: CampoOrdenActividad;
}
```

La respuesta se construye con `crearRespuestaPaginada` y siempre tiene esta
forma, incluso cuando `datos` está vacío:

```json
{
  "datos": [],
  "paginacion": {
    "pagina": 1,
    "limite": 20,
    "total": 0,
    "totalPaginas": 0
  }
}
```

En TypeORM, `skip` es `(pagina - 1) * limite`, `take` es `limite` y `total`
sale de `findAndCount` (o su equivalente en QueryBuilder). No se devuelve una
página cero ni se usa offset como parte del contrato HTTP.

## Autenticación

JWT gestionado por el backend. El token viaja en `Authorization: Bearer <token>`.

- Las contraseñas se guardan **hasheadas** (bcrypt o argon2), nunca en texto plano.
- Los endpoints protegidos usan un guard; los públicos se marcan explícitamente
  con un decorador (`@Public()`).
- La autorización por rol y permiso sale de las entidades `rol`, `permiso` y
  `rol_permiso`.

## Configuración y secretos

`ConfigModule` de `@nestjs/config` está registrado como **global** en
`app.module.ts`: `ConfigService` se inyecta en cualquier módulo sin volver a
importarlo.

El esquema de las variables está en `src/config/variables-entorno.ts` (clase
`VariablesEntorno` + `validarEntorno`) y se valida con `class-validator` **al
arrancar**. Falta una clave o tiene un valor inválido → el proceso no levanta.

- Todo por variables de entorno: credenciales de base de datos, secreto del JWT,
  API keys de Google Maps y Gemini.
- **`.env` nunca se commitea.** `.env.example` tiene las claves y ningún valor.
- Para leer configuración, `ConfigService`, no `process.env` directo:

  ```ts
  constructor(
    private readonly configuracion: ConfigService<VariablesEntorno, true>,
  ) {}

  const url = this.configuracion.get('DATABASE_URL', { infer: true });
  ```

- **Clave nueva** → declarala en `VariablesEntorno`, agregala a `.env.example`, a
  la tabla del README y, si es obligatoria, a `test/entorno-de-prueba.ts` con un
  valor ficticio (si no, los e2e dejan de arrancar).
- Los errores de validación nombran la clave pero **nunca** imprimen su valor: el
  log de un arranque fallido no tiene por qué filtrar un secreto.
- `synchronize: true` de TypeORM solo en desarrollo. En producción, migraciones.

## Base de datos

- `src/config/database.config.ts` arma las opciones de conexión a partir del
  entorno **ya validado**. No revalida: si el proceso llegó ahí, la configuración
  está.
- Acepta `DATABASE_URL` (producción, Railway) **o** las variables sueltas
  `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (desarrollo, son las
  mismas que lee `docker-compose.yml`). Si están las dos, gana la URL. Que esté
  una de las dos lo chequea `validarEntorno`.
- `src/database/database.module.ts` registra `TypeOrmModule.forRootAsync`, para
  que la configuración se resuelva después de que `ConfigModule` leyó el entorno.
- `src/database/data-source.ts` es el `DataSource` del CLI de migraciones. Reusa
  el mismo factory y el mismo validador, así que la app y las migraciones no
  pueden apuntar a bases distintas. El `synchronize: true` que trae el factory no
  molesta: el CLI lo pisa en `false` al inicializar.
- Las entidades se descubren por convención (`*.entity.ts`): al crear una nueva
  no hay que registrarla en ningún lado.
- **Tocaste una entidad → generá la migración** con
  `pnpm migration:generate src/database/migrations/<Nombre>`, revisá el archivo
  (TypeORM confunde un rename con un `drop` + `create`) y commiteala junto al
  cambio. En desarrollo `synchronize` te ajusta el esquema solo y es fácil
  olvidarse, pero en producción está apagado. El flujo completo, incluido el
  choque entre `synchronize` y `migration:run`, está en el
  [README](../../README.md#flujo-de-migraciones).
- La base local se levanta con `pnpm db:up`. El detalle está en el README.
- **Los e2e abren la conexión de verdad**, así que necesitan la base corrida.

## Colas y trabajos

Infraestructura base de mensajería asíncrona (F12, `src/mensajeria/`):
RabbitMQ vía `@golevelup/nestjs-rabbitmq`, un publisher que el negocio usa sin
conocer detalles de AMQP, y un worker que corre como proceso aparte
(`src/worker.ts`, sin HTTP). Todavía sin trabajos funcionales — solo la
infraestructura y un job de ejemplo.

- **Publicar un trabajo**: `MensajeriaService.publicar(TipoTrabajo.X, payload)`.
  El código de negocio no conoce exchanges, routing keys ni ningún detalle de
  RabbitMQ.
- **Agregar un manejador nuevo**: va en `src/mensajeria/worker/manejadores/`,
  decorado con `@RabbitSubscribe`, y **delega en
  `ProcesadorTrabajosService.procesar()`** — es lo que da reintentos, DLQ y
  logging consistentes. No manejar ack/nack a mano.
- **Errores del handler**: `ErrorTrabajoReintentable` (falla transitoria, se
  reintenta) vs. `ErrorTrabajoPermanente` (no vale la pena reintentar, va
  directo a la DLQ). Un error sin clasificar se trata como reintentable. Nunca
  lanzar una `HttpException` en un manejador: `FiltroExcepcionesHttp` es solo
  para el contexto HTTP y el worker no lo tiene.
- **At-least-once**: un trabajo se puede ejecutar más de una vez si el worker
  se cae antes de confirmar. Escribí manejadores que lo toleren.
- **Nunca loguear el payload completo** — puede tener PII (ubicación, datos de
  usuario). Los eventos de log (`job_started`, `job_completed`,
  `job_retry_scheduled`, `job_failed`, `job_dead_lettered`,
  `job_infra_failure`) llevan id, tipo, intento y correlationId, no el
  contenido.
- **Agregar un tipo de trabajo nuevo** requiere: una entrada en `TipoTrabajo`
  (`src/mensajeria/tipos/tipo-trabajo.ts`), sus colas (principal + 2 de retry
  + DLQ) declaradas en `src/mensajeria/mensajeria.config.ts`, y el manejador.
  Es deliberadamente explícito, no hay generación automática de topología.

Detalle completo de la topología (exchanges, colas, ACK/NACK, clasificación de
errores) en `docs/arquitectura.md`.

## Manejo de errores

- Usá las excepciones de NestJS (`NotFoundException`, `BadRequestException`,
  `ForbiddenException`, `ConflictException`), no `throw new Error()`.
- No filtres detalles internos (stack traces, SQL) en la respuesta al cliente.
- **Esto aplica al contexto HTTP.** El worker (`src/worker.ts`) no tiene
  request/response — sus errores se clasifican con `ErrorTrabajoReintentable`/
  `ErrorTrabajoPermanente` (ver "Colas y trabajos" arriba), no con las
  excepciones de Nest ni con `FiltroExcepcionesHttp`.
- `FiltroExcepcionesHttp` está registrado globalmente. Todos los errores, incluso
  rutas inexistentes y excepciones inesperadas, salen con el mismo contrato:

  ```json
  {
    "statusCode": 404,
    "codigo": "PLAN_NO_ENCONTRADO",
    "mensaje": "El plan solicitado no existe",
    "ruta": "/api/planes/99",
    "timestamp": "2026-08-15T18:30:00.000Z"
  }
  ```

- `statusCode` sirve para el protocolo; `codigo` es un identificador estable en
  `SCREAMING_SNAKE_CASE` que el frontend puede interpretar; `mensaje` es legible
  para una persona. `ruta` y `timestamp` ayudan a diagnosticar sin exponer datos
  internos.
- Para un error propio del dominio, pasá `codigo` y `mensaje` en la excepción:

  ```ts
  throw new NotFoundException({
    codigo: 'PLAN_NO_ENCONTRADO',
    mensaje: 'El plan solicitado no existe',
  });
  ```

- Los fallos de validación agregan `errores`, una lista de
  `{ campo, mensajes }`. Es el único campo opcional del contrato común.
- Una excepción no HTTP se registra en el servidor y responde `500`,
  `ERROR_INTERNO` y un mensaje genérico. Nunca se devuelve su mensaje ni stack.

### Código HTTP por tipo de fallo

| Código | Cuándo usarlo | Excepción habitual |
|---|---|---|
| `400 Bad Request` | DTO, query o formato inválido | `BadRequestException` |
| `401 Unauthorized` | Token ausente, inválido o vencido | `UnauthorizedException` |
| `403 Forbidden` | Identidad válida sin permiso sobre la operación | `ForbiddenException` |
| `404 Not Found` | El recurso identificado no existe | `NotFoundException` |
| `405 Method Not Allowed` | La ruta existe pero no acepta ese verbo | Resuelto por la capa HTTP |
| `409 Conflict` | Duplicado o transición incompatible con el estado actual | `ConflictException` |
| `422 Unprocessable Entity` | El formato es válido pero incumple una regla de negocio | `UnprocessableEntityException` |
| `429 Too Many Requests` | Se superó un límite de solicitudes | `TooManyRequestsException` o guard equivalente |
| `500 Internal Server Error` | Fallo inesperado del servidor | Lo normaliza el filtro global |
| `503 Service Unavailable` | Dependencia necesaria temporalmente caída | `ServiceUnavailableException` |

No uses `401` para permisos (es `403`), `404` para ocultar un conflicto, ni `500`
para una condición de negocio conocida. El filtro asigna un `codigo` genérico
por estado cuando la excepción no declara uno propio.

## Tests

- Unitarios junto al código: `planes.service.spec.ts`.
- E2E en `test/`.
- Un CU no debería darse por terminado sin al menos un test del camino feliz.
