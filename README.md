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

## Base de datos local

```bash
pnpm db:up
pnpm db:logs
pnpm db:down
```

El contenedor `smartplan-postgres` usa PostgreSQL 16 y toma las credenciales del
mismo `.env` que la aplicación. Si el puerto local está ocupado, modificá
`DB_PORT` antes de levantarlo.

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
