# SmartPlan — Backend

API REST de **SmartPlan**, sistema inteligente de generación de experiencias
sociales. Proyecto Final 2026 — Ingeniería en Sistemas de Información, UTN
Facultad Regional Mendoza.

**Stack:** NestJS 11 · TypeScript 5.7 · TypeORM 0.3 · PostgreSQL (driver `pg`)

El frontend vive en el repositorio `SmartPlan-front` (Next.js 16).

> Las convenciones del proyecto están en [`skills/`](skills/) y el estado de avance
> en [`SEGUIMIENTO.md`](SEGUIMIENTO.md). Si venís a escribir código, empezá por
> [`AGENTS.md`](AGENTS.md).

---

## Requisitos

| Herramienta | Versión |
|---|---|
| Node.js | 20 o superior |
| pnpm | 10 (el gestor del proyecto; **no uses npm ni yarn**) |
| Docker | con `docker compose`, para la base de datos local |

---

## Puesta en marcha

### 1. Dependencias

```bash
pnpm install
```

### 2. Variables de entorno

La aplicación no arranca sin su configuración:

```bash
cp .env.example .env   # y completá los valores
```

`.env` está en `.gitignore` y **no se commitea**. `.env.example` es la plantilla:
lleva las claves y los comentarios, nunca los valores.

Para desarrollo, los valores de base de datos que trae la plantilla ya coinciden
con los del contenedor de PostgreSQL, así que solo hay que completar
`JWT_SECRET` y las API keys.

### 3. Base de datos en Docker

El repositorio trae un [`docker-compose.yml`](docker-compose.yml) con un
PostgreSQL 16 listo para usar:

```bash
pnpm db:up        # levanta el contenedor en segundo plano
pnpm db:logs      # ver el log (Ctrl+C para salir, el contenedor sigue)
pnpm db:down      # apagarlo
```

Qué levanta:

| | |
|---|---|
| Imagen | `postgres:16-alpine` |
| Contenedor | `smartplan-postgres` |
| Puerto | el de `DB_PORT` en tu `.env` (por defecto `5432`) |
| Usuario / clave / base | los de `DB_USER` / `DB_PASSWORD` / `DB_NAME` |
| Datos | volumen `smartplan_postgres_data`, sobreviven al `db:down` |

El contenedor toma las credenciales del mismo `.env` que la aplicación, así que
las dos puntas quedan sincronizadas solas.

> **Si el puerto 5432 ya está ocupado** por otro PostgreSQL (local o de otro
> proyecto), cambiá `DB_PORT` en el `.env` — por ejemplo a `5433` — y volvé a
> correr `pnpm db:up`. No hace falta tocar el `docker-compose.yml`.

Para comprobar que quedó sana:

```bash
docker compose ps          # STATUS debería decir "healthy"
```

Y para entrar con `psql`:

```bash
docker compose exec postgres psql -U smartplan -d smartplan
```

### 4. Levantar la API

```bash
pnpm start:dev
```

Si la conexión está bien, el arranque muestra `TypeOrmCoreModule dependencies
initialized` y las consultas de TypeORM en el log. Si falla, revisá primero que
el contenedor esté `healthy` y que `DB_PORT` coincida en el `.env`.

---

## Configuración

### Claves

| Clave | Obligatoria | Por defecto | Para qué |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development`, `test` o `production` |
| `PORT` | no | `3000` | Puerto HTTP de la API |
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

### Comandos de migración

Las migraciones viven en `src/database/migrations/`. El CLI de TypeORM usa el
`DataSource` de [`src/database/data-source.ts`](src/database/data-source.ts), que
comparte el factory de configuración con la aplicación: las dos puntas no pueden
apuntar a bases distintas.

```bash
# generar una migración a partir de los cambios en las entidades
pnpm migration:generate src/database/migrations/CrearUsuario

# aplicar las pendientes
pnpm migration:run

# revertir la última
pnpm migration:revert
```

La base tiene que estar levantada: el `generate` compara las entidades contra el
esquema real.

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

La baja es **lógica**: `deleted_at` la maneja `@DeleteDateColumn`, así que se
borra con `repositorio.softRemove()` y las consultas saltean solas lo dado de
baja. Es lo que permite eliminar una cuenta (CU7) o una actividad (CU53) sin
romper los planes que las referencian.

`src/database/entidades.spec.ts` verifica las convenciones sin necesidad de base
de datos: lee la metadata de los decoradores y falla si una tabla no está en la
lista del diagrama, si una columna no está en `snake_case`, si una entidad no
tiene clave primaria o baja lógica, o si una clave foránea quedó sin índice.

### Primera migración

En desarrollo el esquema lo crea `synchronize` al levantar la API contra la base
en Docker. Para producción hay que generar la migración inicial, con la base
levantada y **vacía**:

```bash
pnpm db:up
pnpm migration:generate src/database/migrations/EsquemaInicial
pnpm migration:run
```

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
```

**Antes de abrir un PR:** `pnpm lint` y `pnpm test`.

---

## Flujo de trabajo

`main` y `develop` están protegidas: no se commitea parado en ellas y todo entra
por PR con 2 aprobaciones y base `develop`. El detalle está en
[`skills/02-git-flow/SKILL.md`](skills/02-git-flow/SKILL.md).

```bash
git switch develop && git pull
git switch -c SMART-fXX-descripcion
```
