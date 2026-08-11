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

```bash
cp .env.example .env
```

Los valores por defecto de `.env.example` ya coinciden con los del contenedor de
PostgreSQL, así que en desarrollo no hace falta editar nada. **`.env` no se
commitea.**

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
| Usuario / clave / base | `smartplan` / `smartplan` / `smartplan` |
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

## Configuración de la conexión

La conexión se arma en [`src/config/database.config.ts`](src/config/database.config.ts)
y se registra con `TypeOrmModule.forRootAsync` en
[`src/database/database.module.ts`](src/database/database.module.ts).

Hay dos formas de configurarla, y si están las dos gana `DATABASE_URL`:

| Forma | Variables | Dónde se usa |
|---|---|---|
| Variables sueltas | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Desarrollo (son las mismas que lee Docker) |
| URL completa | `DATABASE_URL` | Producción — es lo que entrega Railway |

Otras variables: `NODE_ENV`, `PORT` y `DB_SSL`. Todas están documentadas en
[`.env.example`](.env.example).

### `synchronize` y migraciones

`NODE_ENV` decide cómo se mueve el esquema:

| Entorno | `synchronize` | `migrationsRun` |
|---|---|---|
| `development` / `test` | `true` — TypeORM ajusta las tablas según las entidades | `false` |
| `production` | **`false`** | `true` — las migraciones pendientes corren al arrancar |

`synchronize` puede borrar columnas y datos al reconciliar el esquema, así que en
producción el esquema se mueve **solo con migraciones**.

---

## Migraciones

Viven en `src/database/migrations/`. El CLI de TypeORM usa el `DataSource` de
[`src/database/data-source.ts`](src/database/data-source.ts), que comparte el
factory de configuración con la aplicación: las dos puntas no pueden apuntar a
bases distintas.

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
git switch -c SMART-XX-descripcion
```
