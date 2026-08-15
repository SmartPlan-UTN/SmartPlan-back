# SmartPlan Back

API REST de SmartPlan, el sistema web que genera planes recreativos
personalizados según presupuesto, ubicación, tiempo disponible, tipo de salida
y preferencias. Proyecto Final 2026 — Ingeniería en Sistemas de Información,
UTN Facultad Regional Mendoza.

## Stack

NestJS 11, TypeScript, PostgreSQL, TypeORM, Jest, ESLint, Prettier y pnpm. El
frontend vive en `SmartPlan-front` (Next.js 16).

## Requisitos

- Node.js 20 o superior
- pnpm 10 o superior
- Docker con Docker Compose para la base local

## Inicio rápido

```bash
pnpm install
cp .env.example .env
pnpm db:up
pnpm start:dev
```

La plantilla `.env.example` configura las credenciales locales de PostgreSQL.
Completá `JWT_SECRET`, `GOOGLE_MAPS_API_KEY` y `OPENAI_API_KEY`. `.env` nunca se
versiona.

La API queda disponible en `http://localhost:3001/api`: todos los endpoints
cuelgan del prefijo `/api` y el backend solo acepta por CORS el origen
configurado en `FRONTEND_URL`, que por defecto es el frontend local en
`http://localhost:3000`. El detalle está en
[Desarrollo y configuración](docs/desarrollo.md).

## Configuración

### Claves

| Clave | Obligatoria | Por defecto | Para qué |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development`, `test` o `production` |
| `PORT` | no | `3001` | Puerto HTTP de la API |
| `FRONTEND_URL` | no | `http://localhost:3000` | Origen autorizado por CORS |
| `DATABASE_URL` | ver abajo | — | Conexión a PostgreSQL (`postgresql://usuario:clave@host:puerto/base`) |
| `DB_HOST` | ver abajo | — | Host de PostgreSQL |
| `DB_PORT` | no | `5432` | Puerto de PostgreSQL |
| `DB_USER` | ver abajo | — | Usuario de PostgreSQL |
| `DB_PASSWORD` | ver abajo | — | Contraseña de PostgreSQL |
| `DB_NAME` | ver abajo | — | Nombre de la base |
| `DB_SSL` | no | `false` | SSL contra la base. Railway lo necesita |
| `JWT_SECRET` | **sí** | — | Firma de los JWT. Mínimo 32 caracteres: `openssl rand -base64 48` |
| `GOOGLE_MAPS_API_KEY` | **sí** | — | Integración con Google Maps (CU48–CU52) |
| `OPENAI_API_KEY` | **sí** | — | Motor de recomendación (CU17–CU23) |

### Las dos formas de configurar la conexión

Tiene que estar **una de las dos**, y si están las dos gana `DATABASE_URL`:

| Forma | Variables | Dónde se usa |
|---|---|---|
| URL completa | `DATABASE_URL` | Producción — es lo que entrega Railway |
| Variables sueltas | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Desarrollo — son las mismas que lee `docker-compose.yml` |

### Cómo funciona

`ConfigModule` está registrado como **global** en
[`src/app.module.ts`](src/app.module.ts), así que `ConfigService` se inyecta en
cualquier módulo sin volver a importarlo.

El esquema vive en
[`src/config/variables-entorno.ts`](src/config/variables-entorno.ts) y se valida
con `class-validator` **al arrancar**. Si falta una clave o tiene un valor
inválido, el proceso falla de entrada con el detalle de qué falta — no a mitad de
un request. Los mensajes nombran la clave pero nunca imprimen su valor.

Leer configuración desde un servicio:

```ts
constructor(
  private readonly configuracion: ConfigService<VariablesEntorno, true>,
) {}

const url = this.configuracion.get('DATABASE_URL', { infer: true });
```

### Agregar una clave nueva

1. Declarala en `VariablesEntorno` con sus decoradores de `class-validator`.
2. Agregala a `.env.example`, comentada y sin valor.
3. Agregala a la tabla de arriba.
4. Si es obligatoria, sumala también a `test/entorno-de-prueba.ts` (valor
   ficticio) para que los e2e sigan arrancando.

---

## Base de datos

La conexión se arma en
[`src/config/database.config.ts`](src/config/database.config.ts) a partir del
entorno ya validado, y se registra con `TypeOrmModule.forRootAsync` en
[`src/database/database.module.ts`](src/database/database.module.ts).

Las entidades se descubren por convención (`*.entity.ts` dentro de `src/`): al
crear una nueva no hay que registrarla en ningún lado.

### `synchronize` y migraciones

`NODE_ENV` decide cómo se mueve el esquema:

| Entorno | `synchronize` | `migrationsRun` |
|---|---|---|
| `development` / `test` | `true` — TypeORM ajusta las tablas según las entidades | `false` |
| `production` | **`false`** | `true` — las migraciones pendientes corren al arrancar |

`synchronize` puede borrar columnas y datos al reconciliar el esquema, así que en
producción el esquema se mueve **solo con migraciones**.

### Flujo de migraciones

Las migraciones viven en `src/database/migrations/`. El CLI de TypeORM usa el
`DataSource` de [`src/database/data-source.ts`](src/database/data-source.ts), que
comparte el factory de configuración con la aplicación: las dos puntas no pueden
apuntar a bases distintas.

El ciclo, cada vez que cambia una entidad:

```bash
pnpm db:up                                                    # 1. base levantada y al día
pnpm migration:generate src/database/migrations/CrearUsuario  # 2. generar
                                                              # 3. leer el archivo generado
pnpm migration:run                                            # 4. aplicar
```

| Paso | Por qué |
|---|---|
| La base tiene que estar levantada y con las migraciones ya aplicadas | `generate` arma el diff comparando las entidades contra el esquema **real**, no contra las migraciones anteriores |
| Leer siempre el archivo generado | TypeORM no distingue un rename de un `drop` + `create`: donde vos renombraste una columna, él puede borrarla con los datos adentro |
| El nombre va descriptivo y en `PascalCase` | El timestamp lo antepone el CLI: `1786560621317-EsquemaInicial.ts` |
| La migración se commitea junto al cambio de entidades | Si viajan separadas, el que traiga la rama queda con un esquema que no puede reproducir |

Una migración ya mergeada **no se edita**: el que ya la corrió la tiene anotada
en la tabla `migrations` y no la va a volver a ejecutar. Los arreglos van en una
migración nueva.

Para revertir la última aplicada:

```bash
pnpm migration:revert
```

Va de a una y en orden inverso: para deshacer tres, se corre tres veces.

#### Verificar que la migración es fiel a las entidades

Después de aplicarla, volvé a generar. Si el esquema quedó igual al que
describen las entidades, no hay nada que generar:

```
$ pnpm migration:generate src/database/migrations/Verificacion
No changes in database schema were found - cannot generate a migration.
```

Ese mensaje es el resultado esperado. Si en cambio te escribe un archivo, la
migración quedó desalineada con las entidades.

#### `synchronize` te puede romper el `migration:run`

En desarrollo la aplicación arranca con `synchronize: true` y crea las tablas
sola. Pero eso **no** anota nada en la tabla `migrations`, así que TypeORM sigue
creyendo que la migración inicial está pendiente:

```
$ pnpm start:dev      # synchronize crea las 37 tablas
$ pnpm migration:run
error: relation "estado_usuario" already exists
```

Cuando pase, hay que vaciar el esquema y dejar que lo construyan las migraciones:

```bash
pnpm typeorm schema:drop
pnpm migration:run
```

En producción el problema no existe: `synchronize` está en `false` y las
migraciones pendientes corren solas al arrancar (`migrationsRun: true`), así que
el despliegue no lleva ningún paso manual.

#### Comandos crudos del CLI

`pnpm typeorm` expone el CLI completo con el `DataSource` ya enchufado:

```bash
pnpm typeorm migration:show    # qué migraciones hay y cuáles están aplicadas
pnpm typeorm schema:drop       # vaciar el esquema entero
pnpm typeorm schema:sync       # forzar el synchronize a mano
```

`schema:drop` y `schema:sync` **borran datos** y apuntan a la base que diga el
`.env`: son para desarrollo, nunca contra producción. `migration:show` es de solo
lectura.

---

## Modelo de datos

Las **37 entidades** del modelo están implementadas con TypeORM, una por
archivo, dentro del módulo al que pertenecen. Salen del diagrama de clases
(Anexo Nº5); `reporte` y `tipo_reporte` quedaron fuera del alcance.

| Carpeta | Entidades |
|---|---|
| `src/usuarios/entities/` | `usuario`, `rol`, `permiso`, `rol_permiso`, `estado_usuario`, `preferencia_usuario` |
| `src/auth/entities/` | `sesion_usuario`, `recuperacion_contrasena` |
| `src/actividades/entities/` | `actividad`, `actividad_categoria`, `actividad_lugar` |
| `src/categorias/entities/` | `categoria`, `estado_categoria` |
| `src/lugares/entities/` | `lugar`, `departamento`, `ciudad`, `pais` |
| `src/planes/entities/` | `plan`, `detalle_plan`, `estado_plan` |
| `src/recomendacion/entities/` | `solicitud_plan`, `solicitud_plan_categoria`, `estado_solicitud`, `tipo_salida`, `retroalimentacion`, `estado_retroalimentacion` |
| `src/valoraciones/entities/` | `valoracion` |
| `src/colecciones/entities/` | `coleccion`, `coleccion_favorito` |
| `src/favoritos/entities/` | `lista_favorito`, `actividad_favorito`, `plan_favorito` |
| `src/integracion-externa/entities/` | `proveedor_externo`, `sincronizacion_externa` |
| `src/administracion/entities/` | `notificacion`, `parametro_sistema`, `registro_auditoria` |

Todavía no hay módulos de NestJS: son solo las entidades. Cada módulo llega con
su primer caso de uso.

### Convenciones

| Regla | Dónde |
|---|---|
| Tabla en `snake_case`, declarada explícita: `@Entity('detalle_plan')` | todas |
| Clase en `PascalCase`, archivo `kebab-case.entity.ts` | todas |
| `id`, `created_at`, `updated_at`, `deleted_at` heredadas | `src/common/entidades/entidad-base.ts` |
| Catálogos con `nombre`, `key` único y `descripcion` | `src/common/entidades/entidad-catalogo.ts` |
| Claves foráneas `id_<entidad>`, **siempre indexadas** | todas |
| Importes en `numeric` convertidos a `number` | `src/common/typeorm/transformador-decimal.ts` |
| Índices únicos reutilizables limitados a filas activas | tablas con baja lógica |
| Restricciones `CHECK` para rangos e importes críticos | entidades correspondientes |

La baja es **lógica**: `deleted_at` la maneja `@DeleteDateColumn`, así que se
borra con `repositorio.softRemove()` y las consultas saltean solas lo dado de
baja. Es lo que permite eliminar una cuenta (CU7) o una actividad (CU53) sin
romper los planes que las referencian.

Los índices únicos de datos reutilizables llevan
`WHERE deleted_at IS NULL`: quitar un favorito, una preferencia o una relación
y volver a agregarla no choca contra la fila dada de baja. Los hashes de sesión
y recuperación son la excepción deliberada, porque un token nunca se reutiliza.

`src/database/entidades.spec.ts` verifica las convenciones sin necesidad de base
de datos: lee la metadata de los decoradores y falla si una tabla no está en la
lista del diagrama, si una columna no está en `snake_case`, si una entidad no
tiene clave primaria o baja lógica, si una clave foránea quedó sin índice o si
un índice único reutilizable no excluye las bajas.

### Migración inicial

El esquema completo de las 37 entidades está en
[`src/database/migrations/1786813686268-EsquemaInicial.ts`](src/database/migrations/1786813686268-EsquemaInicial.ts).
Es lo que construye la base en producción, donde `synchronize` está apagado.

Para construir una base vacía con el mismo esquema que producción:

```bash
pnpm db:up
pnpm migration:run
```

En desarrollo no hace falta: `synchronize` crea las tablas al levantar la API.
Las dos vías no se mezclan bien — el detalle está en
[`synchronize` te puede romper el `migration:run`](#synchronize-te-puede-romper-el-migrationrun).

---

## Comandos

```bash
pnpm start:dev     # servidor con watch
pnpm build         # compilar a dist/
pnpm start:prod    # correr lo compilado
pnpm lint          # análisis estático (ojo: incluye --fix)
pnpm format        # formatear con Prettier
pnpm test          # tests unitarios
pnpm test:e2e      # tests end-to-end (necesitan la base levantada)
pnpm test:cov      # cobertura

pnpm db:up         # levantar PostgreSQL en Docker
pnpm db:down       # bajarlo
pnpm db:logs       # seguir los logs del contenedor

pnpm migration:generate src/database/migrations/<Nombre>    # generar
pnpm migration:run                                          # aplicar las pendientes
pnpm migration:revert                                       # revertir la última
```

Los e2e necesitan PostgreSQL levantado y usan una base aislada que termina en
`_test`; no ejecutan contra la base de desarrollo.

## Documentación

- [Índice documental](docs/README.md)
- [Proyecto y alcance](docs/proyecto.md)
- [Dominio y trazabilidad](docs/dominio.md)
- [Arquitectura](docs/arquitectura.md)
- [Desarrollo y configuración](docs/desarrollo.md)
- [Calidad y pruebas](docs/calidad.md)
- [Despliegue](docs/despliegue.md)
- [Contribución](docs/contribucion.md)
- [Decisiones técnicas](docs/decisiones.md)
- [Seguimiento operativo](SEGUIMIENTO.md)

## Convenciones para agentes

Las instrucciones comunes están en [AGENTS.md](AGENTS.md). Las skills
operativas canónicas viven en [skills/](skills/README.md). Claude Code y
OpenCode las exponen mediante adaptadores versionados, sin enlaces simbólicos.
