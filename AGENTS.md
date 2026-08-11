# SmartPlan Back — Instrucciones para agentes de IA

Este archivo es el punto de entrada. Lo leen Claude Code (vía `CLAUDE.md`),
Codex (`AGENTS.md`) y GitHub Copilot (vía `.github/copilot-instructions.md`).

## Qué es SmartPlan

Aplicación web que genera automáticamente planes recreativos personalizados según
presupuesto, ubicación, tiempo disponible, tipo de salida y preferencias del
usuario. Proyecto Final 2026 — UTN Facultad Regional Mendoza.

Este repositorio es el **backend**: API REST en NestJS con PostgreSQL. El frontend
vive en `SmartPlan-front` (Next.js 16).

## Antes de escribir código, leé esto

| Archivo | Cuándo consultarlo |
|---|---|
| [`skills/00-proyecto/SKILL.md`](skills/00-proyecto/SKILL.md) | Siempre primero: qué es el sistema, alcance, módulos, equipo, stack |
| [`skills/01-dominio/SKILL.md`](skills/01-dominio/SKILL.md) | Antes de nombrar entidades, tablas, endpoints o DTOs |
| [`skills/02-git-flow/SKILL.md`](skills/02-git-flow/SKILL.md) | Antes de cualquier operación de git |
| [`skills/03-backend/SKILL.md`](skills/03-backend/SKILL.md) | Antes de escribir un controller, service o entidad |
| [`skills/04-calidad/SKILL.md`](skills/04-calidad/SKILL.md) | Antes de desactivar una regla de lint o silenciar un warning |
| [`skills/05-arquitectura/SKILL.md`](skills/05-arquitectura/SKILL.md) | Antes de agregar un servicio, una integración externa o un proceso en segundo plano |
| [`skills/06-testing/SKILL.md`](skills/06-testing/SKILL.md) | Antes de escribir el primer test de un caso de uso |
| [`SEGUIMIENTO.md`](SEGUIMIENTO.md) | Para saber en qué estado está cada funcionalidad |

> **Si estás corriendo como Claude Code:** estos mismos archivos también están
> publicados como skills nativas autodescubribles en `.claude/skills/`, y se
> cargan solos según lo que estés haciendo — no hace falta que sigas los links
> de la tabla a mano. `skills/` sigue siendo la fuente real; `.claude/skills/`
> es una copia sincronizada por un hook de pre-commit. Ver
> [`skills/README.md`](skills/README.md) si vas a editar contenido.

## Dos tipos de skill: negocio y habilidad técnica

Hay dos categorías distintas bajo `.claude/skills/`, y no se mezclan:

| Categoría | Prefijo / origen | Qué define |
|---|---|---|
| **Reglas del proyecto** | `smartplan-*`, fuente en `skills/` de este repo | Cómo es SmartPlan: dominio, nombres, git flow, arquitectura, convenciones propias |
| **Habilidades técnicas** | Sin prefijo, instaladas de paquetes externos vía `npx skills add`, fuente en `.agents/skills/` | Cómo ejecutar bien una tarea genérica (patrones de NestJS) — no son específicas de SmartPlan |

Las de negocio dicen **qué construir y cómo se llama**. Las técnicas dicen
**cómo construirlo bien**. Si hay conflicto entre ambas (p. ej. una skill
técnica sugiere inglés y `smartplan-dominio` pide español), **gana la regla del
proyecto**.

### Habilidades técnicas instaladas

| Skill | De dónde | Cuándo se activa |
|---|---|---|
| `nestjs-best-practices` | [Kadajett/agent-nestjs-skills](https://github.com/Kadajett/agent-nestjs-skills) | Escribir, revisar o refactorizar código NestJS: módulos, inyección de dependencias, seguridad, performance |

Se instala y actualiza con `npx skills add <repo> --skill <nombre>` /
`npx skills update`. Fuente real en `.agents/skills/` (universal, la lee
cualquier agente); `.claude/skills/` es un symlink que gestiona esa misma CLI,
no lo edites a mano.

## Reglas que no se negocian

1. **Nunca commitees en `main` ni en `develop`.** Están protegidas y requieren PR
   con 2 aprobaciones. Trabajá siempre en una rama que salga de `develop`.
2. **Los nombres del dominio van en español.** La tabla es `detalle_plan`, la
   clase es `DetallePlan`. No traduzcas al inglés: rompe la trazabilidad
   CU → entidad → código que exige el entregable.
3. **Usá pnpm**, no npm ni yarn.
4. **Toda entrada de la API se valida con un DTO y `class-validator`.**
5. **Nunca devuelvas entidades con campos sensibles** (contraseñas, tokens).
6. **Nada de credenciales ni secretos en el código.** Variables de entorno, y
   `.env` no se commitea.
7. **Corré `pnpm lint` y `pnpm test` antes de dar por terminado un cambio.**
8. **Referenciá el caso de uso (CU) en commits y PRs** cuando la tarea tenga uno.

## Estado del repositorio

Está en **fundaciones**: sobre el starter de NestJS ya están la configuración por
variables de entorno (F02), la conexión a PostgreSQL con TypeORM (F01) y la
infraestructura de tests (F13). **No hay entidades ni módulos de negocio
todavía.** Antes de asumir que algo existe, buscalo en el código.

## Comandos

```bash
pnpm install       # instalar dependencias
pnpm db:up         # levantar PostgreSQL en Docker
pnpm start:dev     # servidor con watch
pnpm build         # compilar
pnpm lint          # análisis estático
pnpm format        # formatear con Prettier
pnpm test          # tests unitarios
pnpm test:e2e      # tests end-to-end (contra la base smartplan_test)
```

## Cuando termines una tarea

Actualizá la fila correspondiente en [`SEGUIMIENTO.md`](SEGUIMIENTO.md): estado,
fecha, rama y PR. Es lo que permite que el siguiente agente (o la siguiente
persona) retome sin releer todo el historial.
