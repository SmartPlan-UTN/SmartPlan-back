# SmartPlan Back - Instrucciones para agentes de IA

Este archivo es la entrada común para OpenCode, Codex, Claude Code y GitHub
Copilot. Las reglas detalladas y accionables están en [skills/](skills/README.md).

## Contexto

SmartPlan genera planes recreativos personalizados según presupuesto,
ubicación, tiempo, tipo de salida y preferencias. Este repositorio contiene la
API REST en NestJS; el cliente web vive en `SmartPlan-front`.

Consultá [docs/README.md](docs/README.md) para documentación estable del
proyecto y [SEGUIMIENTO.md](SEGUIMIENTO.md) para estado, decisiones y bloqueos
operativos.

## Lectura obligatoria

| Archivo                                                              | Cuándo consultarlo                                          |
| -------------------------------------------------------------------- | ----------------------------------------------------------- |
| [`skills/00-proyecto/SKILL.md`](skills/00-proyecto/SKILL.md)         | Siempre primero: sistema, alcance, módulos, equipo y stack  |
| [`skills/01-dominio/SKILL.md`](skills/01-dominio/SKILL.md)           | Antes de nombrar entidades, tablas, rutas, endpoints o DTOs |
| [`skills/02-git-flow/SKILL.md`](skills/02-git-flow/SKILL.md)         | Antes de cualquier operación de Git                         |
| [`skills/03-backend/SKILL.md`](skills/03-backend/SKILL.md)           | Antes de escribir controllers, servicios o entidades        |
| [`skills/04-calidad/SKILL.md`](skills/04-calidad/SKILL.md)           | Antes de desactivar una regla o silenciar un warning        |
| [`skills/05-arquitectura/SKILL.md`](skills/05-arquitectura/SKILL.md) | Antes de agregar una integración o proceso en segundo plano |
| [`skills/06-testing/SKILL.md`](skills/06-testing/SKILL.md)           | Antes de escribir el primer test de un caso de uso          |
| [ROADMAP](https://github.com/SmartPlan-UTN/SmartPlan-front/blob/develop/ROADMAP.md) | Dueño, estimación y sprint de cada issue de ambos repositorios |

## Reglas no negociables

1. Nunca hacer commits directamente en `main` o `develop`; las ramas de trabajo salen de `develop` y vuelven por PR con dos aprobaciones.
2. Usar `pnpm`, nunca npm ni yarn.
3. Mantener nombres del dominio en español: tablas `snake_case` singular, clases `PascalCase`, rutas `kebab-case` plural.
4. Validar toda entrada HTTP con DTOs y `class-validator`; no leer cuerpos crudos.
5. No devolver contraseñas, tokens ni otros campos sensibles.
6. No escribir secretos en código ni versionar `.env`.
7. Usar `ConfigService` para configuración; no acceder a `process.env` fuera de la capa de configuración.
8. Ejecutar `pnpm lint` y `pnpm test` antes de declarar terminado un cambio de código; los cambios integrados requieren también `pnpm test:e2e`.
9. Referenciar el caso de uso en commits y PRs cuando corresponda.
10. Actualizar `SEGUIMIENTO.md` al cerrar trabajo relevante: estado global, decisión, bloqueo o bitácora. GitHub Issues y PRs son la fuente de tareas activas.

## Estado verificable

El proyecto está en **fundaciones**: tiene configuración de entorno, conexión a
PostgreSQL con TypeORM, migraciones y pruebas unitarias/e2e. No hay entidades ni
módulos de negocio todavía. Antes de asumir una capacidad, verificála en el
código y en la documentación correspondiente.

## Comandos de verificación

```bash
pnpm db:up         # levantar PostgreSQL local
pnpm lint
pnpm test
pnpm test:e2e      # contra la base aislada smartplan_test
pnpm build
```

## Alcance de la documentación

- `docs/` documenta el proyecto, el dominio, la arquitectura y las decisiones estables.
- `skills/` contiene instrucciones concretas para ejecutar trabajo correctamente.
- `SEGUIMIENTO.md` registra información temporal y operativa.

Si una regla aparece tanto aquí como en una skill, la skill aporta el detalle
específico. Si hay contradicción con el código, verificá la situación y
documentá la decisión antes de extender el comportamiento.
