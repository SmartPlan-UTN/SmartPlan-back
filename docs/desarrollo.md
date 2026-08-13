# Desarrollo y configuración

## Requisitos

- Node.js 20 o superior
- pnpm 10 o superior
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
e2e usan una base aislada llamada por defecto `smartplan_test`, que se crea
automáticamente en la primera ejecución y nunca debe compartir datos con la
base de desarrollo.

## Variables de entorno actuales

La aplicación valida el esquema al arrancar en
[`src/config/variables-entorno.ts`](../src/config/variables-entorno.ts). Aunque
algunas integraciones todavía sean previstas, sus claves son obligatorias en el
esquema actual y deben tener valores de desarrollo válidos.

| Variable                                       | Obligatoria       | Valor por defecto  | Uso                                           |
| ---------------------------------------------- | ----------------- | ------------------ | --------------------------------------------- |
| `NODE_ENV`                                     | No                | `development`      | Entorno: `development`, `test` o `production` |
| `PORT`                                         | No                | `3001`             | Puerto HTTP                                   |
| `FRONTEND_URL`                                 | No                | `http://localhost:3000` | Único origen que la API autoriza por CORS. Formato `esquema://host[:puerto]`, sin ruta ni barra final |
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

## Contrato HTTP

La configuración HTTP vive en
[`src/config/configurar-aplicacion.ts`](../src/config/configurar-aplicacion.ts) y
la aplican tanto `main.ts` como el arranque de los e2e, para que las pruebas no
corran contra una aplicación distinta de la que se despliega.

Ya implementado:

- **Prefijo global `/api`.** Todos los endpoints cuelgan de ahí; una ruta fuera
  del prefijo responde 404.
- **CORS restringido a `FRONTEND_URL`.** No se usa `*`: un origen distinto del
  configurado recibe la respuesta sin el encabezado
  `Access-Control-Allow-Origin`, que es lo que hace que el navegador la bloquee.
- **Puerto `3001` por defecto**, para no chocar con el `3000` del frontend.
- **Validación de toda entrada con DTOs y `class-validator`** (ver abajo).

Previsto:

- Verbos: `GET` para consultas, `POST` para creación, `PATCH` para cambios y
  `DELETE` para eliminaciones.
- Los endpoints protegidos usarán `Authorization: Bearer <token>`.
- Los errores se expresan con excepciones HTTP de NestJS sin revelar stack traces
  ni detalles SQL.

### Validación de entradas

El `ValidationPipe` global se registra en
[`src/common/validation/configurar-validacion.ts`](../src/common/validation/configurar-validacion.ts)
y se aplica a todo cuerpo declarado con un DTO:

- `whitelist: true` elimina las propiedades que el DTO no declara, así que un
  campo de más no llega nunca al servicio;
- `transform: true` convierte los tipos según los decoradores de
  `class-transformer` — el `"2"` de un JSON llega como `2`;
- una entrada inválida corta con `400` y un cuerpo uniforme.

```json
{
  "statusCode": 400,
  "codigo": "VALIDACION_FALLIDA",
  "mensaje": "Los datos enviados no son válidos",
  "errores": [{ "campo": "cantidad", "mensajes": ["..."] }]
}
```

`codigo` es estable y pensado para que el frontend discrimine sin parsear
mensajes; `errores` lista un elemento por campo rechazado, con la ruta con
puntos en los anidados (`direccion.calle`). Usá
[`EjemploValidacionDto`](../src/common/dto/ejemplo-validacion.dto.ts) como
referencia al crear los DTOs de un módulo nuevo.

No se publica todavía un catálogo de endpoints porque no hay módulos de negocio
implementados. Cada endpoint nuevo debe documentarse con ruta, DTO, respuestas,
autorización requerida y ejemplos de error relevantes.
