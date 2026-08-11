# skills/

Convenciones del proyecto SmartPlan, escritas para que las lean tanto las personas
como los agentes de IA (Claude, Codex, Copilot).

## Contenido

| Carpeta | Qué contiene | Alcance |
|---|---|---|
| `00-proyecto/` | Qué es SmartPlan, objetivo, alcance, módulos, equipo, stack | Compartido |
| `01-dominio/` | Entidades, 62 casos de uso, pantallas, glosario | Compartido |
| `02-git-flow/` | Ramas, protección, PRs, mensajes de commit | Compartido |
| `03-backend/` | NestJS, TypeORM, JWT, validación, estructura de módulos | Solo este repo |
| `04-calidad/` | ESLint y Prettier, reglas activas, qué hacer ante un error | Solo este repo |
| `05-arquitectura/` | Componentes, comunicación, tecnologías, entornos | Compartido |

**Compartido** significa que el archivo es idéntico en `SmartPlan-front` y en
`SmartPlan-back`. Si modificás uno, replicá el cambio en el otro repositorio.

## Cómo lo consume cada herramienta

Ninguna de las tres lee esta carpeta por su cuenta: todas entran por un archivo
raíz que apunta acá.

| Herramienta | Archivo que lee |
|---|---|
| Claude Code | `CLAUDE.md` → `@AGENTS.md` |
| Codex | `AGENTS.md` |
| GitHub Copilot | `.github/copilot-instructions.md` |

Los tres apuntan al mismo contenido, así que **`AGENTS.md` es la fuente de verdad**
y esta carpeta es el detalle.

> Si querés que Claude Code cargue estos archivos como skills nativas
> (autodescubribles), copialos o enlazalos bajo `.claude/skills/<nombre>/SKILL.md`.
> Ya tienen el frontmatter `name` / `description` que ese formato requiere.

## Al agregar una skill nueva

1. Creá la carpeta con un prefijo numérico y un `SKILL.md` adentro.
2. Ponele frontmatter con `name` y `description`. La descripción tiene que decir
   **cuándo** consultar el archivo, no solo qué contiene.
3. Agregala a la tabla de arriba y a la de `AGENTS.md`.
4. Si es compartida, replicala en el otro repositorio.

## Fuente

El contenido sale de `SmartPlan.md`, el documento de Proyecto Final (~3800 líneas).
Es un OCR de un PDF, así que tiene ruido. Los datos que quedaron ambiguos están
marcados en cada archivo. Ante la duda, verificá contra el documento original.
