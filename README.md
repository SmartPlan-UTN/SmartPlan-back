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

## Base de datos local

```bash
pnpm db:up
pnpm db:logs
pnpm db:down
```

El contenedor `smartplan-postgres` usa PostgreSQL 16 y toma las credenciales del
mismo `.env` que la aplicación. Si el puerto local está ocupado, modificá
`DB_PORT` antes de levantarlo.

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
pnpm start:dev
pnpm build
pnpm lint
pnpm format
pnpm test
pnpm test:e2e
pnpm migration:generate src/database/migrations/CrearUsuario
pnpm migration:run
pnpm migration:revert
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
