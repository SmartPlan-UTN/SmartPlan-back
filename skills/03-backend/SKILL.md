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
pnpm build         # compilar
pnpm lint          # análisis estático (solo verificación)
pnpm lint:fix      # análisis estático + corrección automática
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
├── main.ts
├── app.module.ts
├── config/                 configuración y variables de entorno
├── common/                 guards, interceptors, pipes, filters, decoradores
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

## Reglas de la API

- Prefijo global `/api`.
- Verbos REST estándar: `GET` listar/consultar, `POST` crear, `PATCH` modificar,
  `DELETE` eliminar.
- **DTOs con `class-validator` para toda entrada.** Nada de leer `req.body` crudo.
- `ValidationPipe` global con `whitelist: true` para descartar propiedades no
  declaradas en el DTO.
- Las entidades de TypeORM **no se devuelven directamente** si contienen datos
  sensibles (`usuario.contrasena`, tokens). Usá un DTO de respuesta o `@Exclude()`.

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
  API keys de Google Maps y OpenAI.
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

## Manejo de errores

- Usá las excepciones de NestJS (`NotFoundException`, `BadRequestException`,
  `ForbiddenException`, `ConflictException`), no `throw new Error()`.
- No filtres detalles internos (stack traces, SQL) en la respuesta al cliente.

## Tests

- Unitarios junto al código: `planes.service.spec.ts`.
- E2E en `test/`.
- Un CU no debería darse por terminado sin al menos un test del camino feliz.
