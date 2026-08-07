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
| [`SEGUIMIENTO.md`](SEGUIMIENTO.md) | Para saber en qué estado está cada funcionalidad |

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

Está en **scaffold**: solo el starter de NestJS (`app.controller.ts`,
`app.service.ts`, `app.module.ts`, `main.ts`). No hay entidades, módulos de
negocio ni conexión a base de datos configurada. Antes de asumir que algo existe,
buscalo en el código.

## Comandos

```bash
pnpm install       # instalar dependencias
pnpm start:dev     # servidor con watch
pnpm build         # compilar
pnpm lint          # análisis estático
pnpm format        # formatear con Prettier
pnpm test          # tests unitarios
pnpm test:e2e      # tests end-to-end
```

## Cuando termines una tarea

Actualizá la fila correspondiente en [`SEGUIMIENTO.md`](SEGUIMIENTO.md): estado,
fecha, rama y PR. Es lo que permite que el siguiente agente (o la siguiente
persona) retome sin releer todo el historial.
