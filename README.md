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
| `DB_NAME_TEST` | no | `<DB_NAME>_test` | Base contra la que corren los e2e. Solo la lee `test/`, no la aplicación |
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

## Tests

```bash
pnpm test               # unitarios — no necesitan nada levantado
pnpm test:watch         # unitarios en watch, mientras escribís
pnpm test:cov           # unitarios con cobertura → coverage/

pnpm db:up              # PostgreSQL, que los e2e sí necesitan
pnpm test:e2e           # end-to-end
```

Un test suelto:

```bash
pnpm test planes.service           # por nombre de archivo
pnpm test -t "rechaza un plan"     # por nombre del test
```

### Unitarios y e2e

| | Unitario | E2E |
|---|---|---|
| Archivo | `<algo>.spec.ts`, al lado del código | `<modulo>.e2e-spec.ts`, en `test/` |
| Comando | `pnpm test` | `pnpm test:e2e` |
| Qué prueba | Una clase, con sus dependencias mockeadas | La app entera, por HTTP |
| Base de datos | **No** | Sí, `smartplan_test` |

La diferencia la hace el sufijo del archivo; no hay que registrar el test en
ningún lado.

Hay tres archivos escritos como molde, comentados para copiar y pegar:
[`src/app.service.spec.ts`](src/app.service.spec.ts) (servicio),
[`src/app.controller.spec.ts`](src/app.controller.spec.ts) (controller con la
dependencia mockeada) y [`test/app.e2e-spec.ts`](test/app.e2e-spec.ts)
(endpoint).

### Base de prueba aislada

Los e2e levantan el `AppModule` completo, y eso abre una conexión real con
`synchronize: true`: TypeORM reescribe el esquema para que coincida con las
entidades. Contra la base de desarrollo, eso es perder datos. Por eso los tests
corren contra otra base del mismo servidor:

| Base | Para qué |
|---|---|
| `smartplan` | Desarrollo. Tus datos. |
| `smartplan_test` | Tests. Se vacía en cada corrida. |

**No hay que crearla a mano.** Con `pnpm db:up` corriendo, el `globalSetup` de
Jest ([`test/preparar-base-de-datos.ts`](test/preparar-base-de-datos.ts)) crea la
base en la primera corrida y le vacía el esquema en cada una.

El nombre sale de `DB_NAME_TEST`, y si está vacía, de `<DB_NAME>_test`. **Tiene
que terminar en `_test`**: si no, los tests se niegan a arrancar antes de tocar
nada. Es a propósito — un `DROP SCHEMA` contra la base equivocada no se deshace.

El detalle está en [`skills/06-testing/SKILL.md`](skills/06-testing/SKILL.md):
cómo mockear un repositorio de TypeORM, cómo reemplazar una integración externa
en un e2e y qué se le pide a un CU antes de darlo por terminado.

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

**Antes de abrir un PR:** `pnpm lint`, `pnpm test` y `pnpm test:e2e`.

---

## Flujo de trabajo

`main` y `develop` están protegidas: no se commitea parado en ellas y todo entra
por PR con 2 aprobaciones y base `develop`. El detalle está en
[`skills/02-git-flow/SKILL.md`](skills/02-git-flow/SKILL.md).

```bash
git switch develop && git pull
git switch -c SMART-fXX-descripcion
```
