# Desarrollo y configuración

## Requisitos

- Node.js compatible con NestJS 11
- pnpm
- Docker con Docker Compose para ejecutar PostgreSQL local

## Instalación

```bash
pnpm install
cp .env.example .env
pnpm db:up
```

Luego completá `.env` y ejecutá:

```bash
pnpm start:dev
```

## Base local y pruebas e2e

```bash
pnpm db:up
pnpm db:logs
pnpm db:down
```

El contenedor usa las variables `DB_*` del mismo `.env` de la aplicación. Los
`_test`, que se crea automáticamente en la primera ejecución.

## Variables de entorno actuales

La aplicación valida el esquema al arrancar en
[`src/config/variables-entorno.ts`](../src/config/variables-entorno.ts). Aunque
algunas integraciones todavía sean previstas, sus claves son obligatorias en el
esquema actual y deben tener valores de desarrollo válidos.

| Variable                                       | Obligatoria       | Valor por defecto  | Uso                                           |
| ---------------------------------------------- | ----------------- | ------------------ | --------------------------------------------- |
| `NODE_ENV`                                     | No                | `development`      | Entorno: `development`, `test` o `production` |
| `PORT`                                         | No                | `3000`             | Puerto HTTP                                   |
| `DATABASE_URL`                                 | Una de dos formas | -                  | URL; tiene prioridad sobre `DB_*`             |
| `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Una de dos formas | Ver `.env.example` | Alternativa local a `DATABASE_URL`            |
| `DB_PORT`                                      | No                | `5432`             | Puerto de PostgreSQL                          |
| `DB_SSL`                                       | No                | `false`            | SSL para PostgreSQL                           |
| `DB_NAME_TEST`                                 | No                | `<DB_NAME>_test`   | Base exclusiva para e2e                       |
| `JWT_SECRET`                                   | Sí                | -                  | Secreto de JWT, mínimo 32 caracteres          |
| `GOOGLE_MAPS_API_KEY`                          | Sí                | -                  | Integración de lugares prevista               |
| `OPENAI_API_KEY`                               | Sí                | -                  | Recomendación prevista                        |

`.env` no se versiona. Al agregar una variable se debe actualizar el esquema,
`.env.example`, esta tabla y el entorno de pruebas si corresponde.

## Comandos

```bash
pnpm start:dev
pnpm build
pnpm lint
pnpm format
pnpm test
pnpm test:e2e
```

El script `pnpm lint` actual ejecuta ESLint con `--fix`; es un pendiente separar
el chequeo de la corrección automática. Los comandos de migración usan el
`DataSource` de `src/database/data-source.ts`.

## Contrato HTTP previsto

- Prefijo global: `/api`.
- Verbos: `GET` para consultas, `POST` para creación, `PATCH` para cambios y
  `DELETE` para eliminaciones.
- Toda entrada usa DTOs con `class-validator`.
- Los endpoints protegidos usarán `Authorization: Bearer <token>`.
- Los errores se expresan con excepciones HTTP de NestJS sin revelar stack traces
  ni detalles SQL.

No se publica todavía un catálogo de endpoints porque no hay módulos de negocio
implementados. Cada endpoint nuevo debe documentarse con ruta, DTO, respuestas,
