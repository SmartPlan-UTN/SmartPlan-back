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
| `06-testing/` | Unitarios y e2e, base de prueba aislada, cómo mockear | Solo este repo |

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

## Claude Code: autodescubrimiento vía `.claude/skills/`

Además del camino de arriba, cada `SKILL.md` de esta carpeta está publicado como
skill nativa en [`.claude/skills/<nombre>/SKILL.md`](../.claude/skills/), donde
Claude Code las descubre solo y las carga según lo que estés haciendo — sin
depender de que el agente siga el link correcto desde `AGENTS.md`.

**`skills/` es la única fuente que se edita a mano.** `.claude/skills/` es una
copia generada; nunca la edites directamente, se sobrescribe.

La sincronización es automática vía un hook `pre-commit` que corre
`.claude/skills/sync.sh` y agrega los archivos regenerados al commit. Git no
versiona `.git/hooks/`, así que cada persona que clona el repo lo instala
**una vez**:

```bash
cp .claude/skills/pre-commit.hook .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

Si no lo instalaste, corré `bash .claude/skills/sync.sh` a mano después de
editar cualquier `SKILL.md` de esta carpeta, antes de commitear.

## Esto es solo la mitad: reglas de negocio, no habilidades técnicas

Todo lo de esta carpeta (`skills/`) son **reglas del proyecto**: qué es
SmartPlan, cómo se llaman las cosas, cómo se trabaja con git. No enseñan
patrones de NestJS en general — para eso hay una segunda carpeta,
`.agents/skills/`, con **habilidades técnicas** instaladas desde paquetes de
terceros vía la CLI `skills` (`npx skills add <repo> --skill <nombre>`):

| Skill | De dónde | Para qué |
|---|---|---|
| `nestjs-best-practices` | Kadajett/agent-nestjs-skills | Patrones de módulos, inyección de dependencias, seguridad y performance en NestJS |

Esta **no se edita a mano** ni se sincroniza con `sync.sh` — la gestiona la CLI
`skills` (`npx skills update`, `npx skills list`, `npx skills remove`), y su
lockfile es `skills-lock.json` en la raíz del repo. Convive con `smartplan-*`
dentro de `.claude/skills/`, pero son dos sistemas de mantenimiento distintos:
si una regla de dominio (`smartplan-backend`) choca con una sugerencia de esta
skill técnica, gana la regla de dominio.

## Al agregar una skill nueva

1. Creá la carpeta con un prefijo numérico y un `SKILL.md` adentro.
2. Ponele frontmatter con `name` y `description`. La descripción tiene que decir
   **cuándo** consultar el archivo, no solo qué contiene.
3. Agregala a la tabla de arriba y a la de `AGENTS.md`.
4. Agregá su carpeta al mapa `MAP` dentro de `.claude/skills/sync.sh`.
5. Si es compartida, replicala en el otro repositorio (incluido el paso 4, ahí
   también).

## Fuente

El contenido sale de `SmartPlan.md`, el documento de Proyecto Final (~3800 líneas).
Es un OCR de un PDF, así que tiene ruido. Los datos que quedaron ambiguos están
marcados en cada archivo. Ante la duda, verificá contra el documento original.
