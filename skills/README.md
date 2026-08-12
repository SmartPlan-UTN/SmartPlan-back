# skills/

Convenciones del proyecto SmartPlan, escritas para personas y agentes de IA.

## Contenido

| Carpeta            | Qué contiene                                                 | Alcance        |
| ------------------ | ------------------------------------------------------------ | -------------- |
| `00-proyecto/`     | Qué es SmartPlan, objetivo, alcance, módulos, equipo y stack | Compartido     |
| `01-dominio/`      | Entidades, 62 casos de uso, pantallas y glosario             | Compartido     |
| `02-git-flow/`     | Ramas, protección, PRs y mensajes de commit                  | Compartido     |
| `03-backend/`      | NestJS, TypeORM, JWT, validación y estructura de módulos     | Solo este repo |
| `04-calidad/`      | ESLint, Prettier y criterios de calidad                      | Solo este repo |
| `05-arquitectura/` | Componentes, comunicación, tecnologías y entornos            | Compartido     |
| `06-testing/`      | Unitarios, e2e, base aislada y mocks                         | Solo este repo |

**Compartido** significa que el archivo debe ser idéntico en `SmartPlan-front` y
`SmartPlan-back`; replicá cualquier modificación.

## Cómo lo consume cada herramienta

`skills/` es la fuente única. Claude Code y OpenCode las cargan como skills
nativas mediante enlaces simbólicos; no edites las rutas enlazadas.

| Herramienta    | Entrada                                              |
| -------------- | ---------------------------------------------------- |
| Claude Code    | `CLAUDE.md` -> `AGENTS.md` y `.claude/skills/`       |
| OpenCode       | `opencode.json` -> `AGENTS.md` y `.opencode/skills/` |
| Codex          | `AGENTS.md`; `.agents/` es un índice enlazado        |
| GitHub Copilot | `.github/copilot-instructions.md`                    |

`AGENTS.md` aporta instrucciones comunes. La documentación estable del
proyecto está en [`docs/`](../docs/README.md).

## Al agregar una skill

1. Creá una carpeta con prefijo numérico y un `SKILL.md`.
2. Agregá frontmatter `name` y `description`; la descripción debe indicar cuándo usarla.
3. Sumala a esta tabla y a `AGENTS.md`.
4. Si es compartida, replicala en el frontend.

## Fuente

El contenido se basa en `SmartPlan.md`, documento académico con OCR. Ante una
ambigüedad, verificá el documento original antes de convertirla en convención.
