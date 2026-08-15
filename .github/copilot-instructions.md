# SmartPlan Back — Instrucciones para GitHub Copilot

La fuente de verdad de las convenciones de este repositorio es
[`AGENTS.md`](../AGENTS.md) y la carpeta [`skills/`](../skills/). **Leelos antes
de proponer código.** Lo que sigue es el resumen operativo.

## Contexto

SmartPlan genera automáticamente planes recreativos personalizados (presupuesto,
ubicación, tiempo, tipo de salida, preferencias). Este repo es el backend: API
REST. El frontend es `SmartPlan-front` (Next.js 16).

## Stack

NestJS 11 · TypeScript 5.7 · TypeORM · PostgreSQL (driver `pg`) · Jest ·
ESLint 9 + Prettier · **pnpm** como gestor de paquetes.

## Convenciones

- **Dominio en español.** Tabla `snake_case` singular (`detalle_plan`), clase
  `PascalCase` (`DetallePlan`), archivo `kebab-case` (`detalle-plan.entity.ts`),
  ruta `kebab-case` plural (`/api/detalle-planes`). No traduzcas al inglés.
- Declará el nombre de la tabla explícitamente: `@Entity('detalle_plan')`.
- Un módulo de NestJS por módulo del sistema (`auth/`, `usuarios/`, `planes/`,
  `recomendacion/`, `colecciones/`, `favoritos/`, `valoraciones/`, …), cada uno
  con `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/` y `entities/`.
- Prefijo global `/api`. Verbos REST estándar.
- **Toda entrada se valida con un DTO y `class-validator`.** Nada de leer
  `req.body` crudo.
- Usá las excepciones de NestJS (`NotFoundException`, `BadRequestException`,
  `ForbiddenException`, `ConflictException`), no `throw new Error()`.
- Nunca devuelvas entidades con campos sensibles (contraseñas, tokens).

## Seguridad

- Autenticación **JWT**, token en `Authorization: Bearer <token>`.
- Contraseñas hasheadas (bcrypt o argon2), nunca en texto plano.
- Credenciales, secreto del JWT y API keys por variables de entorno. Nunca
  hardcodeadas. `.env` no se commitea.
- `synchronize: true` de TypeORM solo en desarrollo.

## Lint

`recommendedTypeChecked` de typescript-eslint más Prettier como regla de ESLint.
No sugieras código con promesas sin manejar (`no-floating-promises`) ni formato
que Prettier vaya a reescribir.

## Git

`main` y `develop` están protegidas: requieren PR con 2 aprobaciones. Nunca
sugieras commitear directo en esas ramas. Las ramas de trabajo salen de `develop`
y se llaman `SMART-<id-del-ticket>-<descripción>`, donde el id es el del ticket en
el sprint (por ejemplo `SMART-f02-configuracion-por-variables-de-entorno`).

Los mensajes de commit van en español, en imperativo, referenciando el caso de uso:

```
Implementar generación de plan automático (CU17)
```
